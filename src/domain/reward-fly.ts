/**
 * reward-fly.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 获得物品奖励飞入队列：中心发光展示后飞向快捷栏对应槽位。
 * 终点可按设计分辨率 + HUD 布局推算（与 letterbox 对齐）。
 */

import { QUICKBAR_SLOTS } from "./inventory";
import { createId } from "./id";
import type { ResolvedHudLayout } from "./hud-layout";

/** 飞入动画中心图标边长（设计像素，基准 1920 宽） */
export const REWARD_FLY_CENTER_SIZE_DESIGN = 168;

/** 默认飞入结束边长（设计像素；有布局时用 slotSize） */
export const REWARD_FLY_SLOT_SIZE_DESIGN = 64;

/**
 * 单条奖励飞入请求。
 */
export interface RewardFlyRequest {
  /** 队列内唯一 id */
  id: string;

  /** 物品 id（用于定位快捷栏槽） */
  itemId: string;

  /** 已解析的图标 URL；空则仅显示占位光效 */
  iconUrl: string;

  /** 展示名（无图时回退文案） */
  displayName: string;

  /**
   * 快捷栏槽下标（0..7）；入队时按最近获得排序推算。
   * 渲染时仍会优先用 `data-item-id` DOM 定位。
   */
  slotIndex: number;
}

/**
 * 奖励飞入队列快照。
 */
export interface RewardFlyQueueState {
  current: RewardFlyRequest | null;
  pending: RewardFlyRequest[];
}

/**
 * @returns 空队列
 */
export function emptyRewardFlyQueue(): RewardFlyQueueState {
  return { current: null, pending: [] };
}

/**
 * 入队一条奖励飞入。
 *
 * @param state - 当前队列
 * @param req - 不含 id 的请求
 * @param id - 可选自定义 id
 * @returns 新队列
 */
export function enqueueRewardFly(
  state: RewardFlyQueueState,
  req: Omit<RewardFlyRequest, "id">,
  id?: string,
): RewardFlyQueueState {
  const item: RewardFlyRequest = {
    ...req,
    id: id ?? createId("reward"),
  };

  if (state.current === null) {
    return { current: item, pending: [...state.pending] };
  }

  return {
    current: state.current,
    pending: [...state.pending, item],
  };
}

/**
 * 推进队列。
 *
 * @param state - 当前队列
 * @returns 推进后状态
 */
export function advanceRewardFlyQueue(
  state: RewardFlyQueueState,
): RewardFlyQueueState {
  const [next, ...rest] = state.pending;

  return {
    current: next ?? null,
    pending: rest,
  };
}

/**
 * 按快捷栏布局推算目标槽中心（设计像素）。
 *
 * @param layout - resolveHudLayout 结果
 * @param slotIndex - 槽下标（0..7）
 * @returns 设计坐标中心
 *
 * @example
 * ```ts
 * const c = rewardFlySlotCenterDesign(layout, 0);
 * // → 第 0 格中心
 * ```
 */
export function rewardFlySlotCenterDesign(
  layout: ResolvedHudLayout,
  slotIndex: number,
): { x: number; y: number } {
  const idx = Math.max(
    0,
    Math.min(QUICKBAR_SLOTS - 1, Math.floor(slotIndex)),
  );
  const slot = layout.slots[idx];

  if (slot !== undefined) {
    return {
      x: slot.x + slot.w / 2,
      y: slot.y + slot.h / 2,
    };
  }

  const step = layout.root.slotSize + layout.root.gap;

  if (layout.root.direction === "row") {
    return {
      x: layout.root.x + idx * step + layout.root.slotSize / 2,
      y: layout.root.y + layout.root.slotSize / 2,
    };
  }

  return {
    x: layout.root.x + layout.root.slotSize / 2,
    y: layout.root.y + idx * step + layout.root.slotSize / 2,
  };
}

/**
 * 设计坐标 → 宿主本地 CSS 像素（letterbox：offset + design×scale）。
 *
 * @param designX - 设计 X
 * @param designY - 设计 Y
 * @param offsetX - letterbox offsetX
 * @param offsetY - letterbox offsetY
 * @param scale - letterbox scale
 * @returns 宿主本地坐标
 */
export function designPointToHostLocal(
  designX: number,
  designY: number,
  offsetX: number,
  offsetY: number,
  scale: number,
): { x: number; y: number } {
  const s = scale > 0 ? scale : 1;

  return {
    x: offsetX + designX * s,
    y: offsetY + designY * s,
  };
}
