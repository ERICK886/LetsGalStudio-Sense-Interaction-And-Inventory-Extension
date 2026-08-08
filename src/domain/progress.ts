/**
 * progress.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景进度辅助：交互点可见性判定与 once 消耗标记。
 */

import type { HotspotElement, SceneProgress } from "./types";

/**
 * 判断交互点在当前进度下是否应对玩家可见。
 *
 * 规则（优先级从高到低）：
 * 1. `once === true` 且 `progress.consumed[id] === true` → 隐藏
 * 2. `progress.visibility` 显式覆盖该 id → 以覆盖值为准
 * 3. 否则回退 `hotspot.visibleByDefault`
 *
 * @param hotspot - 交互点定义
 * @param progress - 当前场景进度（consumed / visibility）
 * @returns true 表示应渲染并可交互
 *
 * @example
 * ```ts
 * if (isHotspotVisible(hs, progress)) {
 *   // 渲染 HotspotView
 * }
 * ```
 */
export function isHotspotVisible(
  hotspot: HotspotElement,
  progress: SceneProgress,
): boolean {
  if (hotspot.once && progress.consumed[hotspot.id] === true) {
    return false;
  }

  const visibility = progress.visibility;

  if (
    visibility !== undefined &&
    Object.prototype.hasOwnProperty.call(visibility, hotspot.id)
  ) {
    return visibility[hotspot.id] === true;
  }

  return hotspot.visibleByDefault !== false;
}

/**
 * 将交互点标记为已消耗（once 触发后写入）。
 *
 * 不可变更新：返回新的 SceneProgress，不修改入参。
 *
 * @param progress - 当前进度
 * @param hotspotId - 被消耗的交互点 id
 * @returns 新的 SceneProgress（`consumed[hotspotId] = true`）
 *
 * @example
 * ```ts
 * setProgress(markConsumed(progress, hotspot.id));
 * ```
 */
export function markConsumed(
  progress: SceneProgress,
  hotspotId: string,
): SceneProgress {
  return {
    ...progress,
    consumed: {
      ...progress.consumed,
      [hotspotId]: true,
    },
    visibility: progress.visibility,
  };
}
