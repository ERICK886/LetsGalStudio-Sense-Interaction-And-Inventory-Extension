/**
 * player-session.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 玩家会话门闩：在模态 UI（如背包、合成）打开期间阻塞场景交互，
 * 直到 UI 关闭后由 endPlayerSessionWait 解除等待。
 */

/** 当前挂起的门闩状态；无 pending 时为 null */
let pending: { promise: Promise<void>; resolve: () => void } | null = null;

/**
 * 开始（或加入）玩家会话等待。
 *
 * 若已有 pending 门闩，直接返回同一 Promise，避免重复创建。
 *
 * @returns 在 {@link endPlayerSessionWait} 被调用前不会 resolve 的 Promise
 *
 * @example
 * ```ts
 * const wait = beginPlayerSessionWait();
 * // ... 打开模态 UI ...
 * endPlayerSessionWait();
 * await wait; // UI 已关闭，可恢复场景交互
 * ```
 */
export function beginPlayerSessionWait(): Promise<void> {
  if (pending !== null) {
    return pending.promise;
  }

  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  pending = { promise, resolve };
  return promise;
}

/**
 * 结束玩家会话等待并 resolve 当前 pending Promise。
 *
 * 若无 pending 门闩则为 no-op，可安全重复调用。
 *
 * @returns void
 *
 * @example
 * ```ts
 * beginPlayerSessionWait();
 * endPlayerSessionWait(); // 解除所有 await beginPlayerSessionWait() 的调用方
 * ```
 */
export function endPlayerSessionWait(): void {
  if (pending === null) {
    return;
  }

  pending.resolve();
  pending = null;
}

/**
 * 是否存在尚未被 end 解除的 pending 门闩。
 *
 * @returns true 表示仍有 begin 尚未被 end 配对
 *
 * @example
 * ```ts
 * beginPlayerSessionWait();
 * isPlayerSessionPending(); // true
 * endPlayerSessionWait();
 * isPlayerSessionPending(); // false
 * ```
 */
export function isPlayerSessionPending(): boolean {
  return pending !== null;
}

/**
 * 测试专用：重置模块级门闩状态，避免用例间泄漏。
 *
 * 仅应在 Vitest 等测试环境中调用，生产代码勿用。
 *
 * @returns void
 */
export function resetPlayerSessionForTests(): void {
  pending = null;
}
