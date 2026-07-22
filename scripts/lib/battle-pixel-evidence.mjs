const LOGICAL_WIDTH = 390;
const LOGICAL_HEIGHT = 844;

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
    && dynamicBounds.every((bounds) => !rectsIntersect(candidate, bounds))
    && (!viewport || (
      !rectsIntersect(
        logicalRectToPixelRect(candidate, viewport),
        logicalRectToPixelRect(target, viewport),
      )
      && dynamicBounds.every((bounds) => !rectsIntersect(
        logicalRectToPixelRect(candidate, viewport),
        logicalRectToPixelRect(bounds, viewport),
      ))
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

export function passesObjectEvidence({ target, control }) {
  const difference = compareRegionAppearance(target, control);
  return difference.colorDifference > 8 || difference.shapeDifference > 0.08;
}

export function passesDefeatCueEvidence(input) {
  if (
    input.deadEnemy?.id !== input.killedEnemyId
    || input.deadEnemy?.alive !== false
    || !Number.isFinite(input.deadEnemy?.x)
    || !Number.isFinite(input.deadEnemy?.y)
  ) return false;
  const preToCue = compareRegionAppearance(input.preTarget, input.cueTarget);
  const preControlToCue = compareRegionAppearance(
    input.preControl,
    input.cueControl,
  );
  const cueToFollowup = compareRegionAppearance(
    input.cueTarget,
    input.followupTarget,
  );
  const cueControlToFollowup = compareRegionAppearance(
    input.cueControl,
    input.followupControl,
  );
  const localizedEntryColor = preToCue.colorDifference
    - preControlToCue.colorDifference;
  const localizedEntryShape = preToCue.shapeDifference
    - preControlToCue.shapeDifference;
  const localizedExitColor = cueToFollowup.colorDifference
    - cueControlToFollowup.colorDifference;
  const localizedExitShape = cueToFollowup.shapeDifference
    - cueControlToFollowup.shapeDifference;
  return (localizedEntryColor > 4 || localizedEntryShape > 0.04)
    && (localizedExitColor > 2 || localizedExitShape > 0.025);
}

const ENEMY_SIZE = {
  'bubble-fin': [78, 78],
  'needle-jelly': [72, 84],
  'reef-crab': [84, 72],
  'storm-ray-elite': [158, 114],
  'deep-echo-boss': [238, 178],
};

export function buildBattleDynamicBounds(battle, trainMotion) {
  const bounds = [];
  const trainScale = trainMotion?.scale ?? 1;
  bounds.push({
    id: 'train-and-effects',
    x: 195 + (trainMotion?.offsetX ?? 0) - 160 * trainScale,
    y: 842 + (trainMotion?.offsetY ?? 0) - 178 * trainScale,
    width: 320 * trainScale,
    height: 178 * trainScale,
  });
  for (const enemy of battle.enemies) {
    const [width, height] = ENEMY_SIZE[enemy.kind] ?? [84, 84];
    bounds.push({
      id: `enemy-and-effects-${enemy.id}`,
      x: enemy.x - width / 2 - 24,
      y: enemy.y - height / 2 - 24,
      width: width + 48,
      height: height + 48,
    });
  }
  for (const projectile of battle.projectiles) {
    if (!projectile.active) continue;
    bounds.push({
      id: `projectile-and-effects-${projectile.id}`,
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
  return bounds;
}
