const LOGICAL_WIDTH = 390;
const LOGICAL_HEIGHT = 844;
const FIXED_STEP_MS = 1000 / 60;

export function predictNextEnemyRegion(enemy) {
  const nextY = Math.min(
    716,
    enemy.y + enemy.speedPerSecond * FIXED_STEP_MS / 1000,
  );
  return {
    id: enemy.id,
    name: `enemy-${enemy.id}-predicted-death`,
    x: enemy.x - 16,
    y: nextY - 16,
    width: 32,
    height: 32,
  };
}

export function predictDefeatSampleRegions(enemy) {
  const center = predictNextEnemyRegion(enemy);
  const deathX = center.x + center.width / 2;
  const deathY = center.y + center.height / 2;
  return [20, -22].map((offsetX, index) => ({
    id: `${enemy.id}-lobe-${index}`,
    enemyId: enemy.id,
    name: `enemy-${enemy.id}-predicted-lobe-${index}`,
    deathX,
    deathY,
    x: deathX + offsetX,
    y: deathY + 2,
    width: 2,
    height: 2,
  }));
}

export function createEvidenceViewport({
  cssWidth,
  cssHeight,
  devicePixelRatio,
  maxDevicePixelRatio,
}) {
  const scale = Math.min(
    cssWidth / LOGICAL_WIDTH,
    cssHeight / LOGICAL_HEIGHT,
  );
  const contentWidth = Math.min(cssWidth, LOGICAL_WIDTH * scale);
  const contentHeight = Math.min(cssHeight, LOGICAL_HEIGHT * scale);
  const offsetX = Math.max(0, (cssWidth - contentWidth) / 2);
  const offsetY = Math.max(0, (cssHeight - contentHeight) / 2);
  const pixelRatio = Math.min(devicePixelRatio, maxDevicePixelRatio);
  return {
    logicalWidth: LOGICAL_WIDTH,
    logicalHeight: LOGICAL_HEIGHT,
    cssWidth,
    cssHeight,
    scale,
    contentWidth,
    contentHeight,
    offsetX,
    offsetY,
    pixelRatio,
    pixelWidth: Math.max(1, Math.round(cssWidth * pixelRatio)),
    pixelHeight: Math.max(1, Math.round(cssHeight * pixelRatio)),
  };
}

export function logicalRectToPixelRect(rect, viewport) {
  const left = Math.floor(
    (viewport.offsetX + rect.x * viewport.scale) * viewport.pixelRatio,
  );
  const top = Math.floor(
    (viewport.offsetY + rect.y * viewport.scale) * viewport.pixelRatio,
  );
  const right = Math.ceil(
    (viewport.offsetX + (rect.x + rect.width) * viewport.scale)
      * viewport.pixelRatio,
  );
  const bottom = Math.ceil(
    (viewport.offsetY + (rect.y + rect.height) * viewport.scale)
      * viewport.pixelRatio,
  );
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function rectsIntersect(first, second) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function ellipseStrokeIntersectsRect(ellipse, rect) {
  const closestX = Math.max(
    rect.x,
    Math.min(ellipse.centerX, rect.x + rect.width),
  );
  const closestY = Math.max(
    rect.y,
    Math.min(ellipse.centerY, rect.y + rect.height),
  );
  const outerDistance = (
    ((closestX - ellipse.centerX) / ellipse.radiusX) ** 2
    + ((closestY - ellipse.centerY) / ellipse.radiusY) ** 2
  );
  if (outerDistance > 1) return false;

  const innerRadiusX = ellipse.radiusX - ellipse.strokeWidth;
  const innerRadiusY = ellipse.radiusY - ellipse.strokeWidth;
  if (innerRadiusX <= 0 || innerRadiusY <= 0) return true;
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ];
  const entirelyInsideHollowCenter = corners.every(([x, y]) => (
    ((x - ellipse.centerX) / innerRadiusX) ** 2
    + ((y - ellipse.centerY) / innerRadiusY) ** 2
  ) < 1);
  return !entirelyInsideHollowCenter;
}

function mapEllipseStrokeToPixels(bounds, viewport) {
  const pixelScale = viewport.scale * viewport.pixelRatio;
  return {
    geometry: 'ellipse-stroke',
    centerX: (viewport.offsetX + bounds.centerX * viewport.scale)
      * viewport.pixelRatio,
    centerY: (viewport.offsetY + bounds.centerY * viewport.scale)
      * viewport.pixelRatio,
    radiusX: bounds.radiusX * pixelScale + 1,
    radiusY: bounds.radiusY * pixelScale + 1,
    strokeWidth: bounds.strokeWidth * pixelScale + 2,
  };
}

export function boundsIntersectRect(bounds, rect, viewport = null) {
  const logicalIntersection = bounds.geometry === 'ellipse-stroke'
    ? ellipseStrokeIntersectsRect(bounds, rect)
    : rectsIntersect(bounds, rect);
  if (!viewport) return logicalIntersection;
  const pixelRect = logicalRectToPixelRect(rect, viewport);
  const pixelIntersection = bounds.geometry === 'ellipse-stroke'
    ? ellipseStrokeIntersectsRect(
      mapEllipseStrokeToPixels(bounds, viewport),
      pixelRect,
    )
    : rectsIntersect(logicalRectToPixelRect(bounds, viewport), pixelRect);
  return logicalIntersection || pixelIntersection;
}

export function selectSafeControlRegion({
  target,
  candidates,
  dynamicBounds,
  viewport = null,
}) {
  return candidates.find((candidate) => (
    candidate.x >= 0
    && candidate.y >= 0
    && candidate.x + candidate.width <= LOGICAL_WIDTH
    && candidate.y + candidate.height <= LOGICAL_HEIGHT
    && !rectsIntersect(candidate, target)
    && dynamicBounds.every((bounds) => (
      !boundsIntersectRect(bounds, candidate, viewport)
    ))
    && (!viewport || (
      !rectsIntersect(
        logicalRectToPixelRect(candidate, viewport),
        logicalRectToPixelRect(target, viewport),
      )
    ))
  )) ?? null;
}

export function compareRegionAppearance(first, second) {
  const colorDifference = Math.sqrt(first.meanColor.reduce(
    (total, value, index) => total + (value - second.meanColor[index]) ** 2,
    0,
  ));
  const shapeDifference = first.shapeProfile.reduce(
    (total, value, index) => total + Math.abs(
      value - second.shapeProfile[index],
    ),
    0,
  );
  return { colorDifference, shapeDifference };
}

export function passesObjectEvidence({ target, backgroundBaseline, signature }) {
  if (!target) return false;
  if (signature === 'train-cannon') {
    return target.brightCyanFraction >= 0.08
      && target.centerBrightFraction >= 0.24
      && target.centerBrightFraction >= target.brightCyanFraction * 1.5;
  }
  if (!backgroundBaseline) return false;
  const difference = compareRegionAppearance(target, backgroundBaseline);
  return difference.colorDifference > 8 || difference.shapeDifference > 0.08;
}

export function passesDefeatCueEvidence(input) {
  if (
    input.deadEnemy?.id !== input.killedEnemyId
    || input.deadEnemy?.alive !== false
    || !Number.isFinite(input.deadEnemy?.x)
    || !Number.isFinite(input.deadEnemy?.y)
  ) return false;
  const targetAnchor = input.targetAnchor ?? (
    input.targetRegion
      ? {
        x: input.targetRegion.x + input.targetRegion.width / 2,
        y: input.targetRegion.y + input.targetRegion.height / 2,
      }
      : null
  );
  if (
    !input.targetRegion
    || Math.abs(targetAnchor?.x - input.deadEnemy.x) > 0.001
    || Math.abs(targetAnchor?.y - input.deadEnemy.y) > 0.001
    || !Array.isArray(input.frames)
    || input.frames.length < 3
    || !Array.isArray(input.preTarget?.meanColor)
    || !Array.isArray(input.preTarget?.shapeProfile)
    || !Array.isArray(input.preControl?.meanColor)
    || !Array.isArray(input.preControl?.shapeProfile)
  ) return false;

  const firstSquash = input.frames[0]?.defeatSquash;
  if (
    !firstSquash
    || firstSquash.kind !== 'defeat-squash'
    || !Number.isFinite(firstSquash.id)
  ) return false;
  let priorProgress = -Infinity;
  let priorFrame = null;
  let localizedPixelChangeSeen = false;
  let localizedPixelEvolutionSeen = false;
  for (const frame of input.frames) {
    const squash = frame.defeatSquash;
    if (
      squash?.kind !== 'defeat-squash'
      || squash.id !== firstSquash.id
      || squash.sourceEnemyId !== input.killedEnemyId
      || Math.abs(squash.originX - input.deadEnemy.x) > 0.001
      || Math.abs(squash.originY - input.deadEnemy.y) > 0.001
      || !Number.isFinite(squash.progress)
      || squash.progress <= priorProgress
      || !Number.isFinite(squash.size)
      || !Array.isArray(frame.target?.meanColor)
      || !Array.isArray(frame.target?.shapeProfile)
      || !Array.isArray(frame.control?.meanColor)
      || !Array.isArray(frame.control?.shapeProfile)
      || !rectsIntersect(input.targetRegion, particleBounds(squash))
    ) return false;
    priorProgress = squash.progress;
    const interfering = (frame.dynamicBounds ?? []).some((bounds) => (
      boundsIntersectRect(bounds, input.targetRegion)
      && bounds.id !== `enemy-${input.killedEnemyId}`
      && bounds.id !== `effect-defeat-squash-${firstSquash.id}`
      && !(bounds.kind === 'enemy' && bounds.alive === false)
    ));
    if (interfering) return false;
    const targetChange = compareRegionAppearance(input.preTarget, frame.target);
    const controlChange = compareRegionAppearance(input.preControl, frame.control);
    localizedPixelChangeSeen ||= (
      targetChange.colorDifference - controlChange.colorDifference > 4
      || targetChange.shapeDifference - controlChange.shapeDifference > 0.04
    );
    if (priorFrame) {
      const targetEvolution = compareRegionAppearance(
        priorFrame.target,
        frame.target,
      );
      const controlEvolution = compareRegionAppearance(
        priorFrame.control,
        frame.control,
      );
      localizedPixelEvolutionSeen ||= (
        targetEvolution.colorDifference - controlEvolution.colorDifference > 2
        || targetEvolution.shapeDifference - controlEvolution.shapeDifference
          > 0.025
      );
    }
    priorFrame = frame;
  }

  const lastSquash = input.frames[input.frames.length - 1].defeatSquash;
  return localizedPixelChangeSeen
    && localizedPixelEvolutionSeen
    && lastSquash.progress - firstSquash.progress >= 0.12;
}

const ENEMY_SIZE = {
  'bubble-fin': [78, 78],
  'needle-jelly': [72, 84],
  'reef-crab': [84, 72],
  'storm-ray-elite': [158, 114],
  'deep-echo-boss': [238, 178],
};

function particleBounds(particle) {
  if (particle.kind === 'defeat-squash') {
    const radiusX = particle.size * (1 + particle.progress * 0.9);
    const radiusY = particle.size * (0.8 - particle.progress * 0.5);
    const centerY = particle.y + particle.size * particle.progress * 0.22;
    return {
      x: particle.x - radiusX,
      y: centerY - radiusY,
      width: radiusX * 2,
      height: radiusY * 2,
    };
  }
  const radiusX = particle.kind === 'brush-smear'
    ? particle.size * 2.2
    : particle.kind === 'armour-shard' || particle.kind === 'defeat-shard'
      ? particle.size * 1.6
      : particle.size;
  const radiusY = particle.kind === 'brush-smear'
    ? particle.size * 0.42
    : particle.kind === 'armour-shard' || particle.kind === 'defeat-shard'
      ? particle.size * 0.55
      : particle.size;
  const rotation = Number.isFinite(particle.rotation) ? particle.rotation : 0;
  const cosine = Math.abs(Math.cos(rotation));
  const sine = Math.abs(Math.sin(rotation));
  const extentX = radiusX * cosine + radiusY * sine;
  const extentY = radiusX * sine + radiusY * cosine;
  return {
    x: particle.x - extentX,
    y: particle.y - extentY,
    width: extentX * 2,
    height: extentY * 2,
  };
}

export function buildBattleDynamicBounds(battle, trainMotion, effectView = null) {
  const bounds = [];
  const trainScale = trainMotion?.scale ?? 1;
  bounds.push({
    id: 'train',
    x: 195 + (trainMotion?.offsetX ?? 0) - 160 * trainScale,
    y: 842 + (trainMotion?.offsetY ?? 0) - 178 * trainScale,
    width: 320 * trainScale,
    height: 178 * trainScale,
  });
  for (const enemy of battle.enemies) {
    const [width, height] = ENEMY_SIZE[enemy.kind] ?? [84, 84];
    bounds.push({
      id: `enemy-${enemy.id}`,
      kind: 'enemy',
      alive: enemy.alive,
      x: enemy.x - width / 2 - 24,
      y: enemy.y - height / 2 - 24,
      width: width + 48,
      height: height + 48,
    });
  }
  for (const projectile of battle.projectiles) {
    if (!projectile.active) continue;
    bounds.push({
      id: `projectile-${projectile.id}`,
      x: projectile.x - 18,
      y: projectile.y - 18,
      width: 36,
      height: 36,
    });
  }
  for (const loot of battle.loot) {
    if (loot.collected) continue;
    bounds.push({
      id: `loot-${loot.id}`,
      x: loot.x - 14,
      y: loot.y - 14,
      width: 28,
      height: 28,
    });
  }
  const effects = effectView ?? battle.effects ?? {
    particles: [],
    damageNumbers: [],
    rings: [],
  };
  for (const particle of effects.particles ?? []) {
    bounds.push({
      id: `effect-${particle.kind}-${particle.id}`,
      kind: 'effect',
      effectKind: particle.kind,
      ...particleBounds(particle),
    });
  }
  for (const number of effects.damageNumbers ?? []) {
    const width = number.critical ? 96 : 48;
    const height = number.critical ? 26 : 22;
    bounds.push({
      id: `damage-number-${number.id}`,
      kind: 'damage-number',
      x: number.x - width / 2,
      y: number.y - height,
      width,
      height,
    });
  }
  for (const ring of effects.rings ?? []) {
    const radiusX = ring.radius + 2.5;
    const radiusY = ring.radius * 0.72 + 2.5;
    const stroke = Math.max(5, ring.radius * 0.1 + 3.25);
    bounds.push({
      id: `ring-${ring.id}`,
      kind: 'ring',
      geometry: 'ellipse-stroke',
      centerX: ring.x,
      centerY: ring.y,
      radiusX,
      radiusY,
      strokeWidth: stroke,
      x: ring.x - radiusX,
      y: ring.y - radiusY,
      width: radiusX * 2,
      height: radiusY * 2,
    });
  }
  return bounds;
}
