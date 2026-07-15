import { describe, expect, it } from 'vitest';
import { createRoute } from '../../../src/domain/route/RouteGenerator';

describe('RouteGenerator', () => {
  it('creates a route with a boss at the final depth', () => {
    const route = createRoute(17);
    expect(route[route.length - 1]?.type).toBe('boss');
    expect(route.some((node) => node.type === 'shop')).toBe(true);
    expect(route.some((node) => node.type === 'event')).toBe(true);
  });

  it('contains a branch and no non-boss dead end', () => {
    const route = createRoute(17);
    expect(route.some((node) => node.nextNodeIds.length > 1)).toBe(true);
    expect(route.filter((node) => node.type !== 'boss').every((node) => node.nextNodeIds.length > 0)).toBe(true);
  });

  it('recreates the same route from the same seed', () => {
    expect(createRoute(17)).toEqual(createRoute(17));
    expect(createRoute(17)).not.toEqual(createRoute(18));
  });
});
