import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

export const delay = (durationMs) => new Promise((resolve) => {
  setTimeout(resolve, durationMs);
});

export function findChromeExecutable({
  env = process.env,
  platform = process.platform,
} = {}) {
  if (env.CHROME_BIN) {
    if (!existsSync(env.CHROME_BIN)) {
      throw new Error(`CHROME_BIN does not exist: ${env.CHROME_BIN}`);
    }
    return env.CHROME_BIN;
  }

  const candidates = [];
  if (platform === 'win32') {
    for (const root of [
      env.PROGRAMFILES,
      env['PROGRAMFILES(X86)'],
      env.LOCALAPPDATA,
    ]) {
      if (!root) continue;
      candidates.push(path.join(
        root,
        'Google',
        'Chrome',
        'Application',
        'chrome.exe',
      ));
    }
    // Edge uses the same DevTools protocol and keeps local verification
    // available on Windows machines without a separate Chrome install.
    for (const root of [env.PROGRAMFILES, env['PROGRAMFILES(X86)']]) {
      if (!root) continue;
      candidates.push(path.join(
        root,
        'Microsoft',
        'Edge',
        'Application',
        'msedge.exe',
      ));
    }
  } else if (platform === 'linux') {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    );
  } else if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  }

  const executable = candidates.find((candidate) => existsSync(candidate));
  if (executable) return executable;
  throw new Error(
    'Chrome was not found. Install Chrome/Chromium or set CHROME_BIN.',
  );
}

export async function findFreePort(host = '127.0.0.1') {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address
    ? address.port
    : null;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (port === null) throw new Error('Failed to allocate a loopback port');
  return port;
}

export async function waitForHttp(
  url,
  { timeoutMs = 15_000, child = null } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `Process exited before ${url} became ready (code ${child.exitCode})`,
      );
    }
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${url}${detail}`);
}

export async function createCdpTarget(port, url) {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
    { method: 'PUT' },
  );
  if (!response.ok) {
    throw new Error(`CDP target creation failed with HTTP ${response.status}`);
  }
  const target = await response.json();
  if (!target.webSocketDebuggerUrl) {
    throw new Error('CDP target did not expose a WebSocket URL');
  }
  return target;
}

export class CdpClient {
  static async connect(url, timeoutMs = 10_000) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timed out connecting to CDP: ${url}`));
      }, timeoutMs);
      socket.addEventListener('open', () => {
        clearTimeout(timeoutId);
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to connect to CDP: ${url}`));
      }, { once: true });
    });
    return new CdpClient(socket, timeoutMs);
  }

  constructor(socket, timeoutMs = 10_000) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener('message', (event) => this.#handleMessage(event));
    socket.addEventListener('close', () => this.#handleClose());
  }

  send(method, params = {}) {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP socket is not open for ${method}`));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { method, resolve, reject, timeoutId });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(method);
    };
  }

  close() {
    if (
      this.socket.readyState === WebSocket.OPEN
      || this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close();
    }
  }

  #handleMessage(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeoutId);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(
          `CDP ${pending.method} failed: ${message.error.message}`,
        ));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (typeof message.method !== 'string') return;
    for (const listener of this.listeners.get(message.method) ?? []) {
      listener(message.params ?? {});
    }
  }

  #handleClose() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(
        `CDP connection closed while waiting for ${pending.method}`,
      ));
    }
    this.pending.clear();
  }
}

export async function stopChild(child, graceMs = 3_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, delay(graceMs)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([exited, delay(1_000)]);
  }
}
