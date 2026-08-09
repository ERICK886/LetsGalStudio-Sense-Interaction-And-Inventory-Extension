/**
 * ui-button-skin.ts
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.1.0
 *
 * 按钮图片三态（normal / hover / pressed）的规范化与选图回退。
 */

import type { UiButtonSkin } from "./types";

/** 指针相位：常态 / 悬停 / 按下 */
export type UiButtonPointerPhase = "normal" | "hover" | "pressed";

/**
 * 将 trim 后的非空串保留为可选字段值。
 *
 * @param value - 原始值
 * @returns 非空串，或 undefined
 */
function normalizeOptionalNonEmptyString(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed !== "" ? trimmed : undefined;
}

/**
 * 从任意对象规范化按钮三态图片字段（空串丢弃）。
 *
 * @param raw - 含 imageSrc / hoverImageSrc / pressedImageSrc 的对象或部分
 * @returns 仅含非空字段的 UiButtonSkin（可为空对象）
 *
 * @example
 * ```ts
 * normalizeUiButtonSkin({ imageSrc: "  a.png  ", hoverImageSrc: "" });
 * // → { imageSrc: "a.png" }
 * ```
 */
export function normalizeUiButtonSkin(raw: unknown): UiButtonSkin {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {};
  }

  const obj = raw as Record<string, unknown>;
  const result: UiButtonSkin = {};
  const imageSrc = normalizeOptionalNonEmptyString(obj.imageSrc);
  const hoverImageSrc = normalizeOptionalNonEmptyString(obj.hoverImageSrc);
  const pressedImageSrc = normalizeOptionalNonEmptyString(obj.pressedImageSrc);

  if (imageSrc !== undefined) {
    result.imageSrc = imageSrc;
  }

  if (hoverImageSrc !== undefined) {
    result.hoverImageSrc = hoverImageSrc;
  }

  if (pressedImageSrc !== undefined) {
    result.pressedImageSrc = pressedImageSrc;
  }

  return result;
}

/**
 * 浅拷贝三态皮肤（仅复制已定义字段）。
 *
 * @param skin - 源皮肤
 * @returns 独立副本
 */
export function cloneUiButtonSkin(skin: UiButtonSkin): UiButtonSkin {
  return normalizeUiButtonSkin(skin);
}

/**
 * 按指针相位选取背景图 URI（pressed → hover → normal 回退）。
 *
 * @param skin - 三态皮肤
 * @param phase - 当前相位
 * @returns 选中的 URI，或 undefined
 *
 * @example
 * ```ts
 * pickUiButtonSkinSrc({ imageSrc: "a", hoverImageSrc: "b" }, "pressed");
 * // → "b"（无 pressed 时回退 hover）
 * ```
 */
export function pickUiButtonSkinSrc(
  skin: UiButtonSkin,
  phase: UiButtonPointerPhase,
): string | undefined {
  if (phase === "pressed") {
    return skin.pressedImageSrc || skin.hoverImageSrc || skin.imageSrc;
  }

  if (phase === "hover") {
    return skin.hoverImageSrc || skin.imageSrc;
  }

  return skin.imageSrc;
}

/**
 * 将皮肤字段合并进目标节点对象（仅写入已定义键）。
 *
 * @param target - 目标记录
 * @param skin - 三态皮肤
 */
export function assignUiButtonSkin(
  target: Record<string, unknown>,
  skin: UiButtonSkin,
): void {
  if (skin.imageSrc !== undefined) {
    target.imageSrc = skin.imageSrc;
  }

  if (skin.hoverImageSrc !== undefined) {
    target.hoverImageSrc = skin.hoverImageSrc;
  }

  if (skin.pressedImageSrc !== undefined) {
    target.pressedImageSrc = skin.pressedImageSrc;
  }
}
