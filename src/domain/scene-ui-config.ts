/**
 * scene-ui-config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景 UI 预设（获得提示 + 交互点悬停）的默认值、JSON 规范化与解析。
 * 持久化键为 editor.sceneUiJson；交互点实例通过 useGlobal 决定是否跟随全局 hotspotHover。
 */

import {
  defaultHotspotHoverShadow,
  normalizeHotspotHoverShadow,
} from "./hover-shadow";
import {
  defaultItemToastConfig,
  normalizeItemToastConfig,
} from "./item-toast-config";
import type {
  HotspotElement,
  HotspotHoverShadow,
  SceneUiConfig,
} from "./types";

/**
 * 从悬停阴影对象中移除 `useGlobal` 决策字段。
 *
 * 全局段 `SceneUiConfig.hotspotHover` 不使用该标志；运行时 resolve 结果亦无需携带。
 *
 * @param shadow - 已规范化的悬停阴影
 * @returns 不含 `useGlobal` 的副本（enabled / glow / base 保留）
 *
 * @example
 * ```ts
 * stripHotspotHoverUseGlobal({ useGlobal: true, ...defaults });
 * // { enabled: true, glow: {...}, base: {...} }
 * ```
 */
function stripHotspotHoverUseGlobal(
  shadow: HotspotHoverShadow,
): HotspotHoverShadow {
  return {
    enabled: shadow.enabled,
    glow: shadow.glow,
    base: shadow.base,
  };
}

/**
 * 规范化场景 UI 全局悬停段（强制忽略 useGlobal）。
 *
 * @param raw - 原始 hotspotHover 对象或任意值
 * @returns 不含 useGlobal 的全局悬停预设
 */
function normalizeGlobalHotspotHover(raw: unknown): HotspotHoverShadow {
  return stripHotspotHoverUseGlobal(normalizeHotspotHoverShadow(raw));
}

/**
 * 返回场景 UI 预设的完整默认配置。
 *
 * @returns version 1，itemToast 与 hotspotHover 均为领域默认值
 *
 * @example
 * ```ts
 * const ui = defaultSceneUiConfig();
 * // ui.itemToast.placement === "above"
 * // ui.hotspotHover 不含 useGlobal
 * ```
 */
export function defaultSceneUiConfig(): SceneUiConfig {
  return {
    version: 1,
    itemToast: defaultItemToastConfig(),
    hotspotHover: normalizeGlobalHotspotHover(defaultHotspotHoverShadow()),
  };
}

/**
 * 将任意输入规范化为 `SceneUiConfig`。
 *
 * - 非对象 / null / undefined → 完整默认
 * - `itemToast` 经 `normalizeItemToastConfig`
 * - `hotspotHover` 经全局段 normalize（忽略 useGlobal）
 * - `version` 恒为 1
 *
 * @param raw - 原始 JSON 解析结果或部分字段
 * @returns 规范化后的场景 UI 配置
 *
 * @example
 * ```ts
 * normalizeSceneUiConfig(null); // defaultSceneUiConfig()
 * normalizeSceneUiConfig({ hotspotHover: { useGlobal: false } });
 * // hotspotHover 仍不含 useGlobal
 * ```
 */
export function normalizeSceneUiConfig(raw: unknown): SceneUiConfig {
  const defaults = defaultSceneUiConfig();

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return defaultSceneUiConfig();
  }

  const obj = raw as Record<string, unknown>;

  return {
    version: 1,
    itemToast: normalizeItemToastConfig(
      obj.itemToast !== undefined ? obj.itemToast : defaults.itemToast,
    ),
    hotspotHover: normalizeGlobalHotspotHover(
      obj.hotspotHover !== undefined ? obj.hotspotHover : defaults.hotspotHover,
    ),
  };
}

/**
 * 解析 editor 设置中的 sceneUiJson 字符串。
 *
 * - `undefined` / `null` / 空串 → 默认配置
 * - 非法 JSON → 默认配置
 * - 合法 JSON → 经 `normalizeSceneUiConfig` 规范化
 *
 * @param json - 设置项中的 JSON 字符串
 * @returns 规范化后的 `SceneUiConfig`
 *
 * @example
 * ```ts
 * parseSceneUiJson(""); // defaultSceneUiConfig()
 * parseSceneUiJson('{"itemToast":{"placement":"below"}}').itemToast.placement;
 * // "below"
 * ```
 */
export function parseSceneUiJson(
  json: string | undefined | null,
): SceneUiConfig {
  if (json === undefined || json === null || json.trim() === "") {
    return defaultSceneUiConfig();
  }

  try {
    return normalizeSceneUiConfig(JSON.parse(json));
  } catch {
    return defaultSceneUiConfig();
  }
}

/**
 * 将场景 UI 配置序列化为 JSON 字符串（写入前先 normalize）。
 *
 * @param config - 待序列化的配置（可为部分字段）
 * @returns `JSON.stringify(normalizeSceneUiConfig(config))` 的结果
 *
 * @example
 * ```ts
 * stringifySceneUi(defaultSceneUiConfig());
 * // '{"version":1,"itemToast":{...},"hotspotHover":{...}}'
 * ```
 */
export function stringifySceneUi(config: SceneUiConfig): string {
  return JSON.stringify(normalizeSceneUiConfig(config));
}

/**
 * 根据交互点本地 hoverShadow 与全局预设，解析运行时实际使用的悬停阴影。
 *
 * - `local.useGlobal === false` → 使用本地点 enabled/glow/base（保留 useGlobal: false）
 * - 否则 → 使用全局 hotspotHover（不含 useGlobal）
 *
 * 返回值供 `buildHoverShadowFilter` 使用；决策字段 useGlobal 在跟随全局时不写入。
 *
 * @param hotspot - 含 hoverShadow 的交互点（或 Pick）
 * @param globalHover - `SceneUiConfig.hotspotHover` 全局预设
 * @returns 规范化后的有效悬停阴影
 *
 * @example
 * ```ts
 * const global = defaultSceneUiConfig().hotspotHover;
 * resolveHotspotHoverShadow(
 *   { hoverShadow: { useGlobal: false, enabled: false, ...layers } },
 *   global,
 * ).enabled; // false
 *
 * resolveHotspotHoverShadow(
 *   { hoverShadow: defaultHotspotHoverShadow() },
 *   global,
 * ); // 等同 normalizeHotspotHoverShadow(global)，无 useGlobal
 * ```
 */
export function resolveHotspotHoverShadow(
  hotspot: Pick<HotspotElement, "hoverShadow">,
  globalHover: HotspotHoverShadow,
): HotspotHoverShadow {
  const local = normalizeHotspotHoverShadow(hotspot.hoverShadow);

  if (local.useGlobal === false) {
    return local;
  }

  return normalizeGlobalHotspotHover(globalHover);
}
