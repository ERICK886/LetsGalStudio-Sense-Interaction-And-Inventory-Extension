/**
 * toast-queue.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 轻提示队列：current 显示中，pending 等待；advance 将 pending[0] 提升为 current。
 */
import { createId } from "./id";
import type { ElementMotion } from "./types";

/**
 * 单条轻提示请求（含唯一 id）。
 */
export interface ToastRequest {
  /** 队列内唯一标识 */
  id: string;

  /** 提示文案；空串时 UI 层可回退为物品名 */
  text: string;

  /** 锚定热点 id，用于定位 toast 出现位置 */
  anchorHotspotId: string;

  /** 进入/退出动效 */
  motion: ElementMotion;
}

/**
 * 轻提示队列快照。
 */
export interface ToastQueueState {
  /** 当前正在展示的 toast；无则为 null */
  current: ToastRequest | null;

  /** 等待展示的 toast 列表（FIFO） */
  pending: ToastRequest[];
}

/**
 * 创建空队列状态。
 *
 * @returns current 为 null、pending 为 [] 的初始状态
 *
 * @example
 * const q = emptyToastQueue();
 * // { current: null, pending: [] }
 */
export function emptyToastQueue(): ToastQueueState {
  return { current: null, pending: [] };
}

/**
 * 入队一条轻提示。
 *
 * 规则：若 `current == null`，新请求直接成为 `current`；否则追加到 `pending` 末尾。
 *
 * @param state - 当前队列状态
 * @param req - 不含 id 的 toast 内容
 * @param id - 可选自定义 id；缺省时 `createId("toast")`
 * @returns 新队列状态（不修改入参）
 *
 * @example
 * let q = emptyToastQueue();
 * q = enqueueToast(q, { text: "获得钥匙", anchorHotspotId: "hs_a", motion }, "t1");
 */
export function enqueueToast(
  state: ToastQueueState,
  req: Omit<ToastRequest, "id">,
  id?: string,
): ToastQueueState {
  const toast: ToastRequest = {
    ...req,
    id: id ?? createId("toast"),
  };

  if (state.current === null) {
    return {
      current: toast,
      pending: [...state.pending],
    };
  }

  return {
    current: state.current,
    pending: [...state.pending, toast],
  };
}

/**
 * 推进队列：将 `pending[0]` 设为新的 `current`，并从 pending 移除。
 *
 * 若 pending 为空，则 `current` 变为 null。
 *
 * @param state - 当前队列状态
 * @returns 推进后的新状态（不修改入参）
 *
 * @example
 * q = advanceToastQueue(q); // pending[0] 上位；无 pending 时 current 清空
 */
export function advanceToastQueue(state: ToastQueueState): ToastQueueState {
  const [next, ...rest] = state.pending;

  return {
    current: next ?? null,
    pending: rest,
  };
}
