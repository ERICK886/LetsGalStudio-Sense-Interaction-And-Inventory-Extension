/**
 * scene-base-layer.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * DOM 底图 + 设计画幅。children（hotspot overlay）渲染在同一 world
 * transform 内，与底图共用缩放/平移。
 * 0.2.0：默认透明铺底；编辑器可选 chrome（描边/虚线占位），运行时无颜色兜底。
 */

import React, { useRef } from "react";
import {
  clientToLocal,
  type SceneLayout,
} from "./scene-layout";

/**
 * SceneBaseLayer 属性。
 */
export interface SceneBaseLayerProps {
  /** 布局快照 */
  layout: SceneLayout;

  /** 已 resolve 的底图 URL；空串=无底图（透明） */
  imageUrl: string;

  /**
   * 图片加载成功。
   *
   * @param width - naturalWidth
   * @param height - naturalHeight
   */
  onImageNaturalSize?: (width: number, height: number) => void;

  /** 图片加载失败 */
  onImageError?: () => void;

  /**
   * 空白点击（设计画幅布局坐标，已去除 CSS scale）。
   *
   * @param designX - 相对设计画幅左上的布局 X
   * @param designY - 相对设计画幅左上的布局 Y
   */
  onBlankPointerDown?: (designX: number, designY: number) => void;

  /**
   * 叠在底图之上、处于同一 world transform 内的子树（overlay）。
   */
  children?: React.ReactNode;

  /**
   * 设计画幅底色（CSS）。
   * 缺省透明（沉浸式铺底）。
   *
   * @default "transparent"
   */
  frameBackground?: string;

  /**
   * 为 true 时显示编辑器辅助描边 / 无底图虚线框；运行时保持 false。
   *
   * @default false
   */
  editorChrome?: boolean;

  /**
   * 底图不透明度，0–1。
   *
   * @default 1
   */
  baseImageOpacity?: number;

  /**
   * 底图 opacity 过渡时长（毫秒）。
   *
   * @default 200
   */
  baseImageTransitionMs?: number;

  /**
   * 整层（含 world transform）不透明度。
   * 必须与 scale 写在同一节点上，避免父级 opacity 动画被合成成「缩放感」。
   *
   * @default 1
   */
  layerOpacity?: number;

  /**
   * 整层 opacity 过渡时长（毫秒）；0 表示无过渡。
   *
   * @default 0
   */
  layerOpacityTransitionMs?: number;
}

/**
 * 渲染设计画幅、底图，并挂载同变换下的 overlay children。
 *
 * @param props - SceneBaseLayerProps
 * @returns 铺满宿主的底图层
 *
 * @example
 * ```tsx
 * <SceneBaseLayer layout={layout} imageUrl={url} onBlankPointerDown={fn}>
 *   <HotspotLayer ... />
 * </SceneBaseLayer>
 * ```
 */
export function SceneBaseLayer({
  layout,
  imageUrl,
  onImageNaturalSize,
  onImageError,
  onBlankPointerDown,
  children,
  frameBackground = "transparent",
  editorChrome = false,
  baseImageOpacity = 1,
  baseImageTransitionMs = 200,
  layerOpacity = 1,
  layerOpacityTransitionMs = 0,
}: SceneBaseLayerProps): React.ReactElement {
  const worldRef = useRef<HTMLDivElement>(null);
  const { world, designW, designH, contentRect } = layout;

  const clampedOpacity = Math.min(1, Math.max(0, baseImageOpacity));
  const transitionMs =
    Number.isFinite(baseImageTransitionMs) && baseImageTransitionMs >= 0
      ? baseImageTransitionMs
      : 200;
  const clampedLayerOpacity = Math.min(1, Math.max(0, layerOpacity));
  const layerFadeMs =
    Number.isFinite(layerOpacityTransitionMs) && layerOpacityTransitionMs >= 0
      ? layerOpacityTransitionMs
      : 0;

  /**
   * 空白点击 → 设计画幅布局坐标。
   *
   * @param event - 指针事件
   */
  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ): void => {
    if (event.button !== 0 || onBlankPointerDown === undefined) {
      return;
    }

    // 仅响应直接点在 world 上的空白（子元素自行 stopPropagation）
    if (event.target !== event.currentTarget) {
      const target = event.target as HTMLElement;

      if (
        target.closest('[data-testid="scene-design-stage"]') !== null &&
        target !== event.currentTarget
      ) {
        // stage 内由 hotspot 处理；点到 stage 空白仍算空白
        if (target.getAttribute("data-testid") !== "scene-design-stage") {
          return;
        }
      }
    }

    const worldEl = worldRef.current;

    if (worldEl === null) {
      return;
    }

    const local = clientToLocal(worldEl, event.clientX, event.clientY);

    onBlankPointerDown(local.x, local.y);
  };

  return (
    <div
      data-testid="scene-base-layer"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        zIndex: 0,
      }}
    >
      <div
        ref={worldRef}
        data-testid="scene-base-world"
        onPointerDown={onBlankPointerDown ? handlePointerDown : undefined}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: designW,
          height: designH,
          transform: `translate(${world.offsetX}px, ${world.offsetY}px) scale(${world.scale})`,
          transformOrigin: "0 0",
          opacity: clampedLayerOpacity,
          transition:
            layerFadeMs > 0
              ? `opacity ${layerFadeMs}ms cubic-bezier(0.45, 0.05, 0.15, 1)`
              : undefined,
          pointerEvents: onBlankPointerDown ? "auto" : "none",
        }}
      >
        <div
          data-testid="scene-design-frame"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: designW,
            height: designH,
            boxSizing: "border-box",
            background: frameBackground,
            border: editorChrome
              ? "2px solid rgba(60, 60, 72, 0.85)"
              : "none",
            pointerEvents: "none",
          }}
        />

        <div
          data-testid="scene-base-image-box"
          style={{
            position: "absolute",
            left: contentRect.originX,
            top: contentRect.originY,
            width: contentRect.width,
            height: contentRect.height,
            pointerEvents: "none",
            zIndex: 0,
            opacity: clampedOpacity,
            transition: `opacity ${transitionMs}ms ease`,
          }}
        >
          {imageUrl ? (
            <img
              data-testid="scene-base-image"
              src={imageUrl}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                onImageNaturalSize?.(img.naturalWidth, img.naturalHeight);
              }}
              onError={() => {
                onImageError?.();
              }}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "fill",
                pointerEvents: "none",
                userSelect: "none",
              }}
            />
          ) : editorChrome ? (
            <div
              data-testid="scene-base-placeholder"
              style={{
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
                background: "transparent",
                border: "1px dashed rgba(120, 120, 140, 0.45)",
              }}
            />
          ) : null}
        </div>

        {/* overlay：与底图同一 transform，坐标为设计像素 */}
        <div
          data-testid="scene-design-stage"
          // 空白事件仅由 world 处理一次，避免放置模式重复提交及产生两条撤销记录。
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: designW,
            height: designH,
            zIndex: 2,
            pointerEvents: "auto",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
