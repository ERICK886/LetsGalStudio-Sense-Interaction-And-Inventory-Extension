/**
 * scene-ui-config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 场景 UI 预设（获得提示 + 交互点悬停/提示文本 + 返回按钮）的默认值、JSON 规范化与解析。
 * 持久化键为 editor.sceneUiJson；交互点实例通过 useGlobal / useGlobalStyle 跟随全局段。
 */

import {
  DEFAULT_DESIGN_HEIGHT,
  DEFAULT_DESIGN_WIDTH,
} from "./design-resolution";
import {
  defaultHotspotLabelStyleConfigForDesign,
  normalizeHotspotLabelStyleConfig,
  scaleHotspotLabelStyleConfig,
} from "./hotspot-label";
import {
  defaultHotspotHoverShadow,
  normalizeHotspotHoverShadow,
} from "./hover-shadow";
import {
  defaultItemToastConfig,
  normalizeItemToastConfig,
  scaleItemToastConfig,
} from "./item-toast-config";
import {
  defaultSceneReturnButtonConfig,
  normalizeSceneReturnButtonConfig,
  scaleSceneReturnButtonConfig,
} from "./scene-return-button-config";
import type {
  HotspotElement,
  HotspotHoverShadow,
  SceneUiConfig,
} from "./types";

/** 默认布局参照宽 */
const DEFAULT_REF_W = DEFAULT_DESIGN_WIDTH;

/** 默认布局参照高 */
const DEFAULT_REF_H = DEFAULT_DESIGN_HEIGHT;

/**
 * 从悬停配置对象中移除 `useGlobal` 决策字段。
 *
 * 全局段 `SceneUiConfig.hotspotHover` 不使用该标志；运行时 resolve 结果亦无需携带。
 *
 * @param shadow - 已规范化的悬停配置
 * @returns 不含 `useGlobal` 的副本（阴影层与动效/滤镜字段保留）
 *
 * @example
 * ```ts
 * stripHotspotHoverUseGlobal({ useGlobal: true, ...defaults });
 * // { enabled: true, glow: {...}, base: {...}, transitionMs: 120, ... }
 * ```
 */
function stripHotspotHoverUseGlobal(
  shadow: HotspotHoverShadow,
): HotspotHoverShadow {
  const { useGlobal: _useGlobal, ...rest } = shadow;
  return rest;
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
 * 将场景 UI 布局相关字段从一套设计分辨率缩放到另一套。
 *
 * @param cfg - 源配置
 * @param fromW - 源设计宽
 * @param fromH - 源设计高
 * @param toW - 目标设计宽
 * @param toH - 目标设计高
 * @returns 新配置
 */
export function scaleSceneUiLayout(
  cfg: SceneUiConfig,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): SceneUiConfig {
  return {
    ...cfg,
    itemToast: scaleItemToastConfig(cfg.itemToast, fromW, fromH, toW, toH),
    hotspotLabel: scaleHotspotLabelStyleConfig(
      cfg.hotspotLabel,
      fromW,
      fromH,
      toW,
      toH,
    ),
    sceneReturn: scaleSceneReturnButtonConfig(
      cfg.sceneReturn,
      fromW,
      fromH,
      toW,
      toH,
    ),
  };
}

/**
 * 返回场景 UI 预设的完整默认配置（基准 1920×1080；其它设计尺寸等比缩放）。
 *
 * @param refW - 参考设计宽
 * @param refH - 参考设计高
 * @returns version 1，itemToast / hotspotHover / hotspotLabel / sceneReturn 均为领域默认值
 *
 * @example
 * ```ts
 * const ui = defaultSceneUiConfig();
 * // ui.itemToast.placement === "above"
 * // ui.hotspotHover 不含 useGlobal
 * // ui.sceneReturn.enabled === true
 * ```
 */
export function defaultSceneUiConfig(
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): SceneUiConfig {
  return {
    version: 1,
    itemToast: defaultItemToastConfig(refW, refH),
    hotspotHover: normalizeGlobalHotspotHover(defaultHotspotHoverShadow()),
    hotspotLabel: defaultHotspotLabelStyleConfigForDesign(refW, refH),
    sceneReturn: defaultSceneReturnButtonConfig(refW, refH),
  };
}

/**
 * 将任意输入规范化为 `SceneUiConfig`。
 *
 * - 非对象 / null / undefined → 完整默认
 * - `itemToast` 经 `normalizeItemToastConfig`
 * - `hotspotHover` 经全局段 normalize（忽略 useGlobal）
 * - `hotspotLabel` 经 `normalizeHotspotLabelStyleConfig`；缺省段补默认
 * - `sceneReturn` 经 `normalizeSceneReturnButtonConfig`；缺省段补默认
 * - `version` 恒为 1
 *
 * @param raw - 原始 JSON 解析结果或部分字段
 * @param refW - 参考设计宽
 * @param refH - 参考设计高
 * @returns 规范化后的场景 UI 配置
 *
 * @example
 * ```ts
 * normalizeSceneUiConfig(null); // defaultSceneUiConfig()
 * normalizeSceneUiConfig({ hotspotHover: { useGlobal: false } });
 * // hotspotHover 仍不含 useGlobal
 * ```
 */
export function normalizeSceneUiConfig(
  raw: unknown,
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): SceneUiConfig {
  const defaults = defaultSceneUiConfig(refW, refH);

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return defaultSceneUiConfig(refW, refH);
  }

  const obj = raw as Record<string, unknown>;

  return {
    version: 1,
    itemToast: normalizeItemToastConfig(
      obj.itemToast !== undefined ? obj.itemToast : defaults.itemToast,
      refW,
      refH,
    ),
    hotspotHover: normalizeGlobalHotspotHover(
      obj.hotspotHover !== undefined ? obj.hotspotHover : defaults.hotspotHover,
    ),
    hotspotLabel: normalizeHotspotLabelStyleConfig(
      obj.hotspotLabel !== undefined ? obj.hotspotLabel : defaults.hotspotLabel,
      refW,
      refH,
    ),
    sceneReturn: normalizeSceneReturnButtonConfig(
      obj.sceneReturn !== undefined ? obj.sceneReturn : defaults.sceneReturn,
      refW,
      refH,
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
 * @param refW - 参考设计宽
 * @param refH - 参考设计高
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
  refW?: number,
  refH?: number,
): SceneUiConfig {
  const dw = refW ?? DEFAULT_REF_W;
  const dh = refH ?? DEFAULT_REF_H;

  if (json === undefined || json === null || json.trim() === "") {
    return defaultSceneUiConfig(dw, dh);
  }

  try {
    return normalizeSceneUiConfig(JSON.parse(json), dw, dh);
  } catch {
    return defaultSceneUiConfig(dw, dh);
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
 * 根据交互点本地 hoverShadow 与全局预设，解析运行时实际使用的悬停效果。
 *
 * - `local.useGlobal === false` → 使用本地完整配置（保留 useGlobal: false）
 * - 否则 → 使用全局 hotspotHover（不含 useGlobal）
 *
 * 返回值供 `buildHoverRuntimeStyle` 使用；决策字段 useGlobal 在跟随全局时不写入。
 *
 * @param hotspot - 含 hoverShadow 的交互点（或 Pick）
 * @param globalHover - `SceneUiConfig.hotspotHover` 全局预设
 * @returns 规范化后的有效悬停配置
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
 * ); // 等同全局 normalize 结果，无 useGlobal
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
