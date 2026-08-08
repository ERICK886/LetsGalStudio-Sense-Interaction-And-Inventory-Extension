/**
 * settings-sync.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 项目设置字段命令式写入后的进程内通知总线。
 * settings.set 后让订阅 Hook 拉取最新 get 值并重渲染。
 */

import { logError } from "../shared/logger";

/** 设置字段变更监听器 */
type SettingsFieldListener = (key: string) => void;

/** 全局监听集合（扩展单实例场景足够） */
const listeners = new Set<SettingsFieldListener>();

/**
 * 通知某设置字段已被命令式写入。
 *
 * @param key - settings 字段名（如 scenesLibraryJson）
 *
 * @example
 * ```ts
 * ctx.settings.set("scenesLibraryJson", json);
 * notifySettingsField("scenesLibraryJson");
 * ```
 */
export function notifySettingsField(key: string): void {
  for (const listener of listeners) {
    try {
      listener(key);
    } catch (err) {
      logError("settings-sync", "设置同步监听器异常", err);
    }
  }
}

/**
 * 订阅设置字段写入通知。
 *
 * @param listener - 收到任意字段写入时回调（内部再按 key 过滤）
 * @returns 取消订阅函数
 *
 * @example
 * ```ts
 * const off = subscribeSettingsField((key) => {
 *   if (key === "scenesLibraryJson") refresh();
 * });
 * ```
 */
export function subscribeSettingsField(
  listener: SettingsFieldListener,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
