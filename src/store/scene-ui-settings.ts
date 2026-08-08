/**
 * scene-ui-settings.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景 UI 预设（获得提示 + 交互点悬停）的 editor settings 读写。
 * 持久化键 `editor.sceneUiJson`；首次读取可自 `backpack-hud.itemToastJson` 只读迁移。
 */

import type { ExtensionContext } from "@avg-studio/sdk";
import { parseItemToastJson } from "../domain/item-toast-config";
import {
  defaultSceneUiConfig,
  normalizeSceneUiConfig,
  parseSceneUiJson,
  stringifySceneUi,
} from "../domain/scene-ui-config";
import type { SceneUiConfig } from "../domain/types";
import { readAuthorSetting, writeAuthorSetting } from "./author-settings";
import { ITEM_TOAST_JSON_KEY, readHudSetting } from "./hud-settings";
import { notifySettingsField } from "./settings-sync";

/** editor settings 中场景 UI 预设 JSON 的字段名 */
export const SCENE_UI_JSON_KEY = "sceneUiJson";

/**
 * 读取场景 UI 预设配置。
 *
 * 优先级：
 * 1. `editor.sceneUiJson` 非空 → `parseSceneUiJson`
 * 2. 旧键 `backpack-hud.itemToastJson` 非空 → 合并到默认配置的 `itemToast` 段后 normalize
 * 3. 否则 → `defaultSceneUiConfig()`
 *
 * @param ctx - 扩展上下文（编辑器或运行时 cross 读 editor）
 * @returns 规范化后的 `SceneUiConfig`
 *
 * @example
 * ```ts
 * const ui = readSceneUiConfig(ctx);
 * ui.itemToast.placement; // "above" | "below" | ...
 * ui.hotspotHover.enabled; // 全局悬停预设
 * ```
 */
export function readSceneUiConfig(ctx: ExtensionContext): SceneUiConfig {
  const raw = readAuthorSetting(ctx, SCENE_UI_JSON_KEY);
  const fromEditor = typeof raw === "string" ? raw.trim() : "";

  if (fromEditor.length > 0) {
    return parseSceneUiJson(fromEditor);
  }

  // 迁移：旧 itemToastJson 仅用于首次回填 itemToast 段
  const legacy = readHudSetting(ctx, ITEM_TOAST_JSON_KEY);
  const legacyStr = typeof legacy === "string" ? legacy.trim() : "";

  if (legacyStr.length > 0) {
    const base = defaultSceneUiConfig();

    base.itemToast = parseItemToastJson(legacyStr);

    return normalizeSceneUiConfig(base);
  }

  return defaultSceneUiConfig();
}

/**
 * 将场景 UI 预设写入 editor settings 并通知订阅方刷新。
 *
 * 写入前经 `stringifySceneUi` normalize；不会修改 `backpack-hud.itemToastJson`。
 *
 * @param ctx - 扩展上下文（应在 editor 模块内调用）
 * @param config - 待持久化的场景 UI 配置
 *
 * @example
 * ```ts
 * const ui = readSceneUiConfig(ctx);
 * writeSceneUiConfig(ctx, { ...ui, itemToast: nextToast });
 * ```
 */
export function writeSceneUiConfig(
  ctx: ExtensionContext,
  config: SceneUiConfig,
): void {
  writeAuthorSetting(ctx, SCENE_UI_JSON_KEY, stringifySceneUi(config));
  notifySettingsField(SCENE_UI_JSON_KEY);
}
