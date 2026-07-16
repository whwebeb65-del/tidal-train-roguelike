import { describe, expect, it } from 'vitest';
import { requireElement } from '../../web/app/dom';

describe('requireElement', () => {
  it('returns a matching element and rejects a missing selector', () => {
    const expected = { id: 'app' } as unknown as HTMLDivElement;
    const root = {
      querySelector(selector: string) {
        return selector === '#app' ? expected : null;
      },
    } as ParentNode;

    expect(requireElement<HTMLDivElement>(root, '#app')).toBe(expected);
    expect(() => requireElement(root, '#missing')).toThrow(
      'Required element not found: #missing',
    );
  });
});
