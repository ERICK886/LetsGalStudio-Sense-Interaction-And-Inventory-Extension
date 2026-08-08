/**
 * save-sync.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 扩展存档字段写入后的进程内通知总线。
 *
 * Studio 1.9.x 的 save.useValue 可能未接通；命令式 save.set 后
 * 依赖 useSaveValue 本地 state 的组件需经本总线拉取最新 get 值。
 */

import { logError } from "../shared/logger";

/** 存档字段变更监听器 */
type SaveFieldListener = (key: string) => void;

/** 全局监听集合（扩展单实例场景足够） */
const listeners = new Set<SaveFieldListener>();

/**
 * 通知某存档字段已被命令式写入。
 *
 * @param key - saveSchema 字段名（如 inventoryJson）
 *
 * @example
 * ```ts
 * save.set("inventoryJson", json);
 * notifySaveField("inventoryJson");
 * ```
 */
export function notifySaveField(key: string): void {
  for (const listener of listeners) {
    try {
      listener(key);
    } catch (err) {
      logError("save-sync", "存档同步监听器异常", err);
    }
  }
}

/**
 * 订阅存档字段写入通知。
 *
 * @param listener - 收到任意字段写入时回调（内部再按 key 过滤）
 * @returns 取消订阅函数
 *
 * @example
 * ```ts
 * const off = subscribeSaveField((key) => {
 *   if (key === "inventoryJson") refresh();
 * });
 * ```
 */
export function subscribeSaveField(listener: SaveFieldListener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
