/**
 * motion.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 元素动效默认值与规范化：将未知/非法输入钳制为合法的 ElementMotion。
 */
import type { ElementMotion, MotionPresetId, MotionSide } from "./types";

/** 动效时长上限（毫秒） */
export const MOTION_MS_MAX = 10_000;

/** 默认动效时长（毫秒） */
export const MOTION_DEFAULT_DURATION_MS = 300;

const VALID_PRESETS: readonly MotionPresetId[] = [
  "none",
  "fade",
  "scale",
  "slideUp",
  "slideDown",
  "slideLeft",
  "slideRight",
] as const;

/**
 * 判断 preset 是否为合法 MotionPresetId。
 *
 * @param value - 待校验值
 * @returns 是否为合法 preset
 */
function isValidPreset(value: unknown): value is MotionPresetId {
  return (
    typeof value === "string" &&
    (VALID_PRESETS as readonly string[]).includes(value)
  );
}

/**
 * 将毫秒值钳制到 [0, MOTION_MS_MAX]，非有限数回退 defaultMs。
 *
 * @param value - 原始毫秒
 * @param defaultMs - 非法时的默认值
 * @returns 钳制后的整数毫秒
 */
function clampMotionMs(value: unknown, defaultMs: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultMs;
  }

  return Math.min(MOTION_MS_MAX, Math.max(0, Math.round(value)));
}

/**
 * 返回单侧动效默认值（preset 为 none）。
 *
 * @returns 默认 MotionSide
 *
 * @example
 * const side = defaultMotionSide();
 * // { preset: "none", delayMs: 0, durationMs: 300, customCss: "" }
 */
export function defaultMotionSide(): MotionSide {
  return {
    preset: "none",
    delayMs: 0,
    durationMs: MOTION_DEFAULT_DURATION_MS,
    customCss: "",
  };
}

/**
 * 返回 enter/exit 均为默认值的 ElementMotion。
 *
 * @returns 默认 ElementMotion
 */
export function defaultElementMotion(): ElementMotion {
  return {
    enter: defaultMotionSide(),
    exit: defaultMotionSide(),
  };
}

/**
 * 规范化单侧动效配置。
 *
 * @param raw - 原始输入（可为 partial 或非法结构）
 * @param defaults - 缺省字段来源
 * @returns 合法的 MotionSide
 */
function normalizeMotionSide(raw: unknown, defaults: MotionSide): MotionSide {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return { ...defaults };
  }

  const obj = raw as Record<string, unknown>;

  return {
    preset: isValidPreset(obj.preset) ? obj.preset : "none",
    delayMs: clampMotionMs(obj.delayMs, defaults.delayMs),
    durationMs: clampMotionMs(obj.durationMs, defaults.durationMs),
    customCss:
      typeof obj.customCss === "string" ? obj.customCss : defaults.customCss,
  };
}

/**
 * 将任意输入规范化为 ElementMotion；非法 preset 回退 none，毫秒钳制到合法范围。
 *
 * @param raw - 原始 JSON/对象/undefined
 * @returns 规范化后的 ElementMotion
 *
 * @example
 * normalizeElementMotion(undefined); // 两侧 preset 均为 "none"
 */
export function normalizeElementMotion(raw: unknown): ElementMotion {
  const enterDefault = defaultMotionSide();
  const exitDefault = defaultMotionSide();

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {
      enter: enterDefault,
      exit: exitDefault,
    };
  }

  const obj = raw as Record<string, unknown>;

  return {
    enter: normalizeMotionSide(obj.enter, enterDefault),
    exit: normalizeMotionSide(obj.exit, exitDefault),
  };
}
