import { describe, expect, it } from 'vitest';
import { getPrototypeCatalog } from '../../../src/content/PrototypeCatalog';
import type { ModuleDefinition, PassengerDefinition } from '../../../src/content/ContentTypes';
import type { BuildState } from '../../../src/domain/build/BuildTypes';
import { addModule, addPassenger, getActiveSynergies } from '../../../src/domain/build/SynergySystem';

const catalog = getPrototypeCatalog();
const passenger = (id: string): PassengerDefinition => catalog.passengers.find((item) => item.id === id)!;
const module = (id: string): ModuleDefinition => catalog.modules.find((item) => item.id === id)!;
const emptyBuild = (): BuildState => ({ passengers: [], modules: [], activeTags: [] });

describe('SynergySystem', () => {
  it('activates the steam fire synergy with a fire passenger and steam cannon', () => {
    const build = addPassenger(emptyBuild(), passenger('firefighter'));
    const upgraded = addModule(build, module('steam-cannon'));
    expect(getActiveSynergies(upgraded).map((item) => item.id)).toContain('steam-fire');
  });

  it('activates sound copy and repair drone synergies', () => {
    const soundBuild = addModule(addPassenger(emptyBuild(), passenger('violinist')), module('sound-mirror'));
    const repairBuild = addModule(
      addPassenger(addPassenger(emptyBuild(), passenger('mechanic')), passenger('doctor')),
      module('repair-drone'),
    );

    expect(getActiveSynergies(soundBuild).map((item) => item.id)).toContain('sound-copy');
    expect(getActiveSynergies(repairBuild).map((item) => item.id)).toContain('repair-drone');
  });

  it('does not mutate the previous build', () => {
    const build = emptyBuild();
    const next = addPassenger(build, passenger('mechanic'));
    expect(build.passengers).toHaveLength(0);
    expect(next.passengers).toHaveLength(1);
  });
});
