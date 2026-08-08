/**
 * backpack-ui-session.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 背包 UI 进程内会话：在 HUD 已挂载时，通过事件再次打开全屏背包
 *（避免 `ui.show` 复用不重挂载导致 openBackpack prop 失效）。
 */

/** 打开全屏背包请求监听器 */
type OpenBackpackListener = () => void;

/** 订阅者集合 */
const openListeners = new Set<OpenBackpackListener>();

/**
 * 请求打开全屏背包（通知已挂载的 BackpackShell）。
 *
 * @example
 * ```ts
 * requestOpenBackpack();
 * ```
 */
export function requestOpenBackpack(): void {
  for (const listener of openListeners) {
    listener();
  }
}

/**
 * 订阅「打开全屏背包」请求。
 *
 * @param listener - 回调
 * @returns 取消订阅函数
 *
 * @example
 * ```ts
 * useEffect(() => subscribeOpenBackpack(() => setBagOpen(true)), []);
 * ```
 */
export function subscribeOpenBackpack(
  listener: OpenBackpackListener,
): () => void {
  openListeners.add(listener);

  return () => {
    openListeners.delete(listener);
  };
}
