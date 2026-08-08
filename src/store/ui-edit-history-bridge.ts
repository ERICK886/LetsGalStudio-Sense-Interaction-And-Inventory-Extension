/**
 * ui-edit-history-bridge.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * UI 分区撤销/重做桥接：UiEditorPanel 注册句柄，editor-shell 顶栏/快捷键调用。
 * 避免把 HUD/背包配置状态上提到 shell。
 */

/**
 * UI 历史桥接句柄（由 UiEditorPanel 实现）。
 */
export interface UiHistoryBridge {
  /**
   * 撤销当前子分区（快捷栏 / 全屏背包）一步。
   *
   * @returns 是否实际发生了撤销
   */
  undo(): boolean;

  /**
   * 重做当前子分区一步。
   *
   * @returns 是否实际发生了重做
   */
  redo(): boolean;

  /** 当前子分区是否可撤销 */
  canUndo(): boolean;

  /** 当前子分区是否可重做 */
  canRedo(): boolean;
}

/** 当前注册的桥接；面板未挂载时为 null */
let bridge: UiHistoryBridge | null = null;

/** canUndo/canRedo 变化时通知 shell 刷新顶栏 */
const tickListeners = new Set<() => void>();

/**
 * 通知所有订阅者刷新 UI 历史相关 chrome（如顶栏 disabled）。
 *
 * @example
 * ```ts
 * notifyUiHistoryTick();
 * ```
 */
export function notifyUiHistoryTick(): void {
  for (const listener of tickListeners) {
    listener();
  }
}

/**
 * 注册或注销 UI 历史桥接（面板 mount/unmount）。
 *
 * @param next - 句柄；传 null 表示注销
 *
 * @example
 * ```ts
 * useEffect(() => {
 *   registerUiHistoryBridge({ undo, redo, canUndo, canRedo });
 *   return () => registerUiHistoryBridge(null);
 * }, [undo, redo]);
 * ```
 */
export function registerUiHistoryBridge(next: UiHistoryBridge | null): void {
  bridge = next;
  notifyUiHistoryTick();
}

/**
 * 订阅历史状态变化（用于顶栏按钮）。
 *
 * @param listener - 无参回调
 * @returns 取消订阅
 */
export function subscribeUiHistoryTick(listener: () => void): () => void {
  tickListeners.add(listener);

  return () => {
    tickListeners.delete(listener);
  };
}

/**
 * 通过桥接撤销；无桥接时返回 false。
 *
 * @returns 是否撤销成功
 */
export function uiHistoryUndo(): boolean {
  return bridge?.undo() ?? false;
}

/**
 * 通过桥接重做；无桥接时返回 false。
 *
 * @returns 是否重做成功
 */
export function uiHistoryRedo(): boolean {
  return bridge?.redo() ?? false;
}

/**
 * @returns 当前是否可撤销
 */
export function uiHistoryCanUndo(): boolean {
  return bridge?.canUndo() ?? false;
}

/**
 * @returns 当前是否可重做
 */
export function uiHistoryCanRedo(): boolean {
  return bridge?.canRedo() ?? false;
}
