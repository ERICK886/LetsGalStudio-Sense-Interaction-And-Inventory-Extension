/**
 * reward-fly.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 获得物品奖励飞入队列：中心发光展示后飞向快捷栏对应槽位。
 */

import { createId } from "./id";

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
