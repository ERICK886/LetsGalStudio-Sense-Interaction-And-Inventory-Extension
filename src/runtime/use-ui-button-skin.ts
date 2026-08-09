/**
 * use-ui-button-skin.ts
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.1.0
 *
 * 按钮图片三态：指针相位 + 资源 URL 解析，供 HUD / 背包 / 场景返回共用。
 */

import React, { useMemo, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  pickUiButtonSkinSrc,
  type UiButtonPointerPhase,
} from "../domain/ui-button-skin";
import type { UiButtonSkin } from "../domain/types";
import { resolveAssetUrl } from "../shared/resolve-asset-url";

/**
 * useUiButtonSkin 返回值。
 */
export interface UseUiButtonSkinResult {
  /** 当前指针相位 */
  phase: UiButtonPointerPhase;
  /** 已解析的背景图 URL（无图时为空串） */
  imageUrl: string;
  /** 可直接展开到 button 的指针事件 */
  pointerHandlers: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
  /** 背景图相关内联样式（无图时为空对象） */
  backgroundImageStyle: React.CSSProperties;
}

/**
 * 按钮三态图片 hook：跟踪 hover/pressed 并解析当前皮肤 URL。
 *
 * @param skin - UiButtonSkin（可为空对象）
 * @returns 相位、imageUrl、指针 handlers 与背景样式
 *
 * @example
 * ```tsx
 * const skin = useUiButtonSkin({ imageSrc: "asset://a.png" });
 * <button {...skin.pointerHandlers} style={{ ...skin.backgroundImageStyle }} />
 * ```
 */
export function useUiButtonSkin(skin: UiButtonSkin): UseUiButtonSkinResult {
  const ctx = useExtensionContext();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const phase: UiButtonPointerPhase = pressed
    ? "pressed"
    : hovered
      ? "hover"
      : "normal";

  const imageSrc = pickUiButtonSkinSrc(skin, phase);
  const imageUrl = useMemo(
    () =>
      imageSrc
        ? resolveAssetUrl(imageSrc, ctx.asset?.resolve?.bind(ctx.asset))
        : "",
    [imageSrc, ctx.asset],
  );

  const pointerHandlers = useMemo(
    () => ({
      onPointerEnter: (): void => {
        setHovered(true);
      },
      onPointerLeave: (): void => {
        setHovered(false);
        setPressed(false);
      },
      onPointerDown: (): void => {
        setPressed(true);
      },
      onPointerUp: (): void => {
        setPressed(false);
      },
      onPointerCancel: (): void => {
        setPressed(false);
      },
    }),
    [],
  );

  const backgroundImageStyle: React.CSSProperties = imageUrl
    ? {
        backgroundImage: `url("${imageUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
    : {};

  return {
    phase,
    imageUrl,
    pointerHandlers,
    backgroundImageStyle,
  };
}
