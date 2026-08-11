/**
 * return-button-session.ts
 * 作者: 池水三两升
 * 日期: 2026-08-10
 * 版本: 0.1.0
 *
 * 本次打开场景交互对「返回按钮是否显示」的会话覆盖。
 * null = 跟随 SceneUiConfig.sceneReturn.enabled；true/false = 强制显示/隐藏。
 */

import { notifySaveField, subscribeSaveField } from "./save-sync";

/** 与 save-sync 共用总线的伪字段名 */
const SYNC_KEY = "__returnButtonVisibleOverride";

/** 会话覆盖；null 表示跟随场景 UI 全局 */
let visibleOverride: boolean | null = null;

/**
 * 设置本次会话返回按钮可见性覆盖。
 *
 * @param value - true 强制显示；false 强制隐藏；null 跟随全局
 */
export function setReturnButtonVisibleOverride(
  value: boolean | null,
): void {
  if (visibleOverride === value) {
    return;
  }

  visibleOverride = value;
  notifySaveField(SYNC_KEY);
}

/**
 * @returns 当前覆盖；null 表示跟随全局
 */
export function getReturnButtonVisibleOverride(): boolean | null {
  return visibleOverride;
}

/**
 * 订阅覆盖变化。
 *
 * @param listener - 回调
 * @returns 取消订阅
 */
export function subscribeReturnButtonVisibleOverride(
  listener: () => void,
): () => void {
  return subscribeSaveField((key) => {
    if (key === SYNC_KEY) {
      listener();
    }
  });
}

/**
 * 解析方法参数中的返回按钮可见性。
 *
 * - 未传 / 空 / `follow` → null（跟随场景 UI）
 * - `show` / true → true
 * - `hide` / false → false
 *
 * @param raw - 方法参数原始值（enum value 或兼容旧字符串）
 * @returns 覆盖值或 null
 */
export function parseReturnButtonVisibleParam(
  raw: unknown,
): boolean | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  if (typeof raw === "boolean") {
    return raw;
  }

  const key = String(raw).trim().toLowerCase();

  if (
    key.length === 0 ||
    key === "follow" ||
    key === "default" ||
    key === "auto" ||
    key === "全局" ||
    key === "跟随"
  ) {
    return null;
  }

  if (
    key === "show" ||
    key === "true" ||
    key === "1" ||
    key === "on" ||
    key === "显示" ||
    key === "是"
  ) {
    return true;
  }

  if (
    key === "hide" ||
    key === "false" ||
    key === "0" ||
    key === "off" ||
    key === "隐藏" ||
    key === "否"
  ) {
    return false;
  }

  return null;
}
