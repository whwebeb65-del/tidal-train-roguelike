import { describe, expect, it } from 'vitest';
import { createCaptainRig } from '../../../web/battle/LayeredSpriteRig';

describe('captain layered rig', () => {
  it('animates head, scarf and arm while the body anchor stays fixed', () => {
    const rig = createCaptainRig();
    const idle = rig.pose(0, { action: 'idle', hitPulse: 0 });
    const later = rig.pose(500, { action: 'cast', hitPulse: 0 });

    expect(idle.map((part) => part.id)).toEqual([
      'body',
      'head',
      'arm',
      'scarf',
      'glow',
    ]);
    expect(later.find((part) => part.id === 'body')?.anchorY).toBe(
      idle.find((part) => part.id === 'body')?.anchorY,
    );
    expect(later.find((part) => part.id === 'arm')?.rotation).not.toBe(
      idle.find((part) => part.id === 'arm')?.rotation,
    );
    expect(later.find((part) => part.id === 'head')?.offsetY).not.toBe(
      idle.find((part) => part.id === 'head')?.offsetY,
    );
  });
});
