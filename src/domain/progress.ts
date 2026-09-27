/**
 * progress.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景进度辅助：交互点可见性判定与 once 消耗标记。
 */

import type { HotspotElement, SceneProgress } from "./types";
import { evaluateHotspotConditionGroup } from "./hotspot-condition";

/**
 * 判断交互点在当前进度下是否应对玩家可见。
 *
 * 规则（优先级从高到低）：
 * 1. `once === true` 且 `progress.consumed[id] === true` → 隐藏
 * 2. 开启完成后显示时，同场景普通交互点须全部完成
 * 3. 显式显隐覆盖或默认可见状态均须满足游戏变量条件
 *
 * @param hotspot - 交互点定义
 * @param progress - 当前场景进度（consumed / visibility）
 * @param getVariable - 游戏变量读取器；场景运行时由 SDK 提供
 * @returns true 表示应渲染并可交互
 *
 * @example
 * ```ts
 * if (isHotspotVisible(hs, progress, getVariable, scene.hotspots)) {
 *   // 渲染 HotspotView
 * }
 * ```
 */
export function isHotspotVisible(
  hotspot: HotspotElement,
  progress: SceneProgress,
  getVariable: (name: string) => unknown = () => undefined,
  sceneHotspots: readonly HotspotElement[] = [],
): boolean {
  if (hotspot.once && progress.consumed[hotspot.id] === true) {
    return false;
  }

  if (
    hotspot.showAfterAllOthers === true &&
    sceneHotspots.some(
      (other) =>
        other.id !== hotspot.id &&
        other.showAfterAllOthers !== true &&
        progress.interacted?.[other.id] !== true &&
        progress.consumed[other.id] !== true,
    )
  ) {
    return false;
  }

  const visibility = progress.visibility;

  if (
    visibility !== undefined &&
    Object.prototype.hasOwnProperty.call(visibility, hotspot.id)
  ) {
    return (
      visibility[hotspot.id] === true &&
      evaluateHotspotConditionGroup(hotspot.visibleIf, getVariable)
    );
  }

  return (
    hotspot.visibleByDefault !== false &&
    evaluateHotspotConditionGroup(hotspot.visibleIf, getVariable)
  );
}

/** 记录成功交互；一次性交互点同时标记为已消耗。 */
export function markHotspotInteracted(
  progress: SceneProgress,
  hotspot: HotspotElement,
): SceneProgress {
  return {
    ...progress,
    interacted: { ...progress.interacted, [hotspot.id]: true },
    consumed: hotspot.once
      ? { ...progress.consumed, [hotspot.id]: true }
      : progress.consumed,
  };
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

/**
 * 设置交互点可见性覆盖（不可变）。
 *
 * 写入 `progress.visibility[hotspotId]`；不影响 `consumed`。
 * `isHotspotVisible` 会优先读该覆盖（once 已消耗除外）。
 *
 * @param progress - 原进度（不会被修改）
 * @param hotspotId - 交互点 id
 * @param visible - 覆盖后的可见性
 * @returns 新的 SceneProgress 副本
 *
 * @example
 * ```ts
 * const next = setHotspotVisibility(progress, "door", false);
 * save.set("progressJson", stringifyProgress(next));
 * ```
 */
export function setHotspotVisibility(
  progress: SceneProgress,
  hotspotId: string,
  visible: boolean,
): SceneProgress {
  return {
    ...progress,
    consumed: progress.consumed,
    visibility: {
      ...progress.visibility,
      [hotspotId]: visible,
    },
  };
}
