// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderResetSaveDialog } from '../../web/views/ResetSaveDialogView';

function renderDialog(): HTMLDialogElement {
  const host = document.createElement('div');
  host.innerHTML = renderResetSaveDialog();
  const dialog = host.querySelector('dialog#reset-save-dialog');
  if (!(dialog instanceof HTMLDialogElement)) throw new Error('Expected a native dialog');
  return dialog;
}

describe('reset save dialog', () => {
  it('starts closed and names what will be erased, kept, and not recoverable', () => {
    const dialog = renderDialog();
    expect(dialog.open).toBe(false);
    const title = dialog.querySelector(`#${dialog.getAttribute('aria-labelledby')}`);
    const description = dialog.querySelector(`#${dialog.getAttribute('aria-describedby')}`);
    expect(title?.textContent).toBe('清空本机进度？');
    expect(description?.textContent).toContain('当前浏览器保存的角色、装备、货币、航线与档案');
    expect(description?.textContent).toContain('无法在游戏内恢复');
    expect(description?.textContent).toContain('声音、画质等设置会保留');
  });

  it('focuses keep-save by default and has no implicit submit path', () => {
    const dialog = renderDialog();
    const buttons = [...dialog.querySelectorAll('button')];
    expect(buttons.map((button) => [button.dataset.action, button.textContent, button.type]))
      .toEqual([
        ['cancel-reset-save', '保留存档', 'button'],
        ['confirm-reset-save', '清空存档', 'button'],
      ]);
    expect([...dialog.querySelectorAll('[autofocus]')]).toEqual([buttons[0]]);
    expect(dialog.querySelector('form')).toBeNull();
  });
});
