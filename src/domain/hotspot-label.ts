/**
 * hotspot-label.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 交互点悬浮/常驻名称标签的默认值与规范化。
 */
import { defaultElementMotion, normalizeElementMotion } from "./motion";
import type { HotspotLabel, HotspotLabelMode } from "./types";

const VALID_MODES: readonly HotspotLabelMode[] = ["hover", "always", "hidden"];

/**
 * 判断 value 是否为合法 HotspotLabelMode。
 *
 * @param value - 待校验值
 * @returns 是否为合法标签显示模式
 */
function isValidLabelMode(value: unknown): value is HotspotLabelMode {
  return (
    typeof value === "string" &&
    (VALID_MODES as readonly string[]).includes(value)
  );
}

/**
 * 将偏移量规范化为有限数；非法时返回 undefined。
 *
 * @param value - 原始偏移
 * @returns 有限数或 undefined
 */
function normalizeOffset(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

/**
 * 返回标签默认值（hover 模式 + 默认动效）。
 *
 * @returns 默认 HotspotLabel
 */
export function defaultHotspotLabel(): HotspotLabel {
  return {
    text: "",
    mode: "hover",
    customCss: "",
    motion: defaultElementMotion(),
  };
}

/**
 * 将任意 JSON 输入规范化为 HotspotLabel；完全非法时返回 undefined。
 *
 * @param raw - 原始 label 对象或 undefined
 * @returns 规范化后的标签，或 undefined（表示不显示标签配置）
 *
 * @example
 * normalizeHotspotLabel(undefined); // undefined
 * normalizeHotspotLabel({ text: "门" }); // mode 默认 hover，motion 默认 none
 */
export function normalizeHotspotLabel(raw: unknown): HotspotLabel | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }

  if (typeof raw !== "object") {
    return undefined;
  }

  const obj = raw as Record<string, unknown>;
  const defaults = defaultHotspotLabel();
  const offsetX = normalizeOffset(obj.offsetX);
  const offsetY = normalizeOffset(obj.offsetY);

  const label: HotspotLabel = {
    text: typeof obj.text === "string" ? obj.text : defaults.text,
    mode: isValidLabelMode(obj.mode) ? obj.mode : defaults.mode,
    customCss:
      typeof obj.customCss === "string" ? obj.customCss : defaults.customCss,
    motion: normalizeElementMotion(obj.motion),
  };

  if (offsetX !== undefined) {
    label.offsetX = offsetX;
  }

  if (offsetY !== undefined) {
    label.offsetY = offsetY;
  }

  return label;
}
