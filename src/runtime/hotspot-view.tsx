/**
 * hotspot-view.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 运行时交互点：可配置悬浮阴影、标签、PNG 剪影 alpha-hit（对齐大地图地点）。
 *
 * 行为要点：
 * - 悬停阴影由 hotspot.hoverShadow 经 normalize + buildHoverShadowFilter 生成
 * - 有图：pointermove 同步 data-si-hit；透明区无阴影/hover 标签/pointer 光标
 * - 透明区 pointerdown 不 stopPropagation，事件可落到下层
 * - 镂空内部仍命中（剪影掩码）
 * - 无图或采样失败 → 整框可点
 */

import React, { useCallback, useRef, useState } from "react";
import {
  buildHoverShadowFilter,
  normalizeHotspotHoverShadow,
} from "../domain/hover-shadow";
import type { HotspotElement } from "../domain/types";
import { isOpaqueImageHit } from "../shared/alpha-hit";
import {
  normToWorld,
  type ContentRect,
} from "../shared/scene-layout";

/** 无图时的默认占位边长（设计像素） */
export const RUNTIME_HOTSPOT_PLACEHOLDER_SIZE = 64;

/**
 * HotspotView 组件属性。
 */
export interface HotspotViewProps {
  /** 交互点定义 */
  hotspot: HotspotElement;

  /** 归一化坐标参照矩形 */
  contentRect: ContentRect;

  /**
   * 解析资源 URI → 可加载 URL。
   *
   * @param uri - 领域 URI
   * @returns 可加载 URL；空串表示无图
   */
  resolveUrl: (uri: string) => string;

  /**
   * 点击命中（alpha-hit 通过）后触发。
   *
   * @param hotspot - 被点击的交互点
   */
  onActivate: (hotspot: HotspotElement) => void;
}

/**
 * 推算交互点在设计画幅中的显示尺寸。
 *
 * @param hs - 交互点
 * @returns `{ width, height }` 设计像素
 */
function hotspotDisplaySize(hs: HotspotElement): {
  width: number;
  height: number;
} {
  const w =
    typeof hs.visual.width === "number" && hs.visual.width > 0
      ? hs.visual.width
      : RUNTIME_HOTSPOT_PLACEHOLDER_SIZE;
  const h =
    typeof hs.visual.height === "number" && hs.visual.height > 0
      ? hs.visual.height
      : RUNTIME_HOTSPOT_PLACEHOLDER_SIZE;

  return { width: w, height: h };
}

/**
 * 运行时单个交互点视图。
 *
 * @param props - HotspotViewProps
 * @returns 交互点 DOM
 *
 * @example
 * ```tsx
 * <HotspotView
 *   hotspot={hs}
 *   contentRect={layout.contentRect}
 *   resolveUrl={resolve}
 *   onActivate={handleActivate}
 * />
 * ```
 */
export function HotspotView({
  hotspot,
  contentRect,
  resolveUrl,
  onActivate,
}: HotspotViewProps): React.ReactElement {
  const imgRef = useRef<HTMLImageElement | null>(null);
  /** 指针是否落在剪影内（有图时）；无图恒为 true */
  const [alphaHit, setAlphaHit] = useState(false);
  /** 指针是否仍在外壳内（用于 leave 复位） */
  const [pointerInside, setPointerInside] = useState(false);

  const size = hotspotDisplaySize(hotspot);
  const center = normToWorld(hotspot.x, hotspot.y, contentRect);
  const url = resolveUrl(hotspot.visual.src);
  const hasImage = Boolean(url);
  const hoverFilter = buildHoverShadowFilter(
    normalizeHotspotHoverShadow(hotspot.hoverShadow),
  );

  const label = hotspot.label;
  const labelText =
    label !== undefined && label.text.trim() !== ""
      ? label.text
      : hotspot.name;
  const labelMode = label?.mode ?? "hover";

  /**
   * 当前是否视为「悬停在可交互剪影上」。
   * - 无图：只要指针在框内
   * - 有图：需 alphaHit
   */
  const interactiveHover =
    pointerInside && (!hasImage || alphaHit);

  const showShadow = hoverFilter !== undefined && interactiveHover;
  const showLabel =
    labelMode === "always" ||
    (labelMode === "hover" && interactiveHover);

  /**
   * 按指针位置同步剪影命中状态。
   *
   * @param clientX - 浏览器 clientX
   * @param clientY - 浏览器 clientY
   * @returns 是否命中（无图恒 true；采样失败回退 true）
   */
  const syncAlphaHit = useCallback(
    (clientX: number, clientY: number): boolean => {
      if (!hasImage) {
        setAlphaHit(true);

        return true;
      }

      const img = imgRef.current;

      if (img === null) {
        setAlphaHit(true);

        return true;
      }

      const hit = isOpaqueImageHit(img, clientX, clientY);

      setAlphaHit(hit);

      return hit;
    },
    [hasImage],
  );

  /**
   * pointerdown：剪影命中才激活；透明区不拦截事件（对齐大地图地点）。
   *
   * @param event - 指针事件
   */
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const hit = syncAlphaHit(event.clientX, event.clientY);

      if (!hit) {
        // 透明区域：不 stopPropagation，让下层可响应
        return;
      }

      event.stopPropagation();
      onActivate(hotspot);
    },
    [hotspot, onActivate, syncAlphaHit],
  );

  /**
   * pointermove：更新 data-si-hit / 阴影 / hover 标签。
   *
   * @param event - 指针事件
   */
  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      syncAlphaHit(event.clientX, event.clientY);
    },
    [syncAlphaHit],
  );

  /**
   * 指针进入外壳。
   *
   * @param event - 指针事件
   */
  const handlePointerEnter = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      setPointerInside(true);
      syncAlphaHit(event.clientX, event.clientY);
    },
    [syncAlphaHit],
  );

  /**
   * 指针离开外壳：复位 hit。
   */
  const handlePointerLeave = useCallback((): void => {
    setPointerInside(false);
    setAlphaHit(false);
  }, []);

  return (
    <div
      data-testid={`runtime-hotspot-${hotspot.id}`}
      data-hotspot-id={hotspot.id}
      data-si-alpha={hasImage ? "1" : undefined}
      data-si-hit={hasImage ? (alphaHit ? "1" : "0") : undefined}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      style={{
        position: "absolute",
        left: center.x - size.width / 2,
        top: center.y - size.height / 2,
        width: size.width,
        height: size.height,
        boxSizing: "border-box",
        // 有图时：仅剪影命中显示 pointer；透明区 default（视觉提示不拦截由逻辑保证）
        cursor: hasImage
          ? alphaHit
            ? "pointer"
            : "default"
          : "pointer",
        pointerEvents: "auto",
        overflow: "visible",
        filter: showShadow ? hoverFilter : undefined,
        transition: "filter 120ms ease-out",
      }}
    >
      {url ? (
        <img
          ref={imgRef}
          src={url}
          alt=""
          draggable={false}
          // 尽量允许 canvas 采样；跨域失败时 isOpaqueImageHit 回退整框
          crossOrigin="anonymous"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      ) : (
        <div
          data-testid={`runtime-hotspot-placeholder-${hotspot.id}`}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 4,
            background: "rgba(46, 196, 164, 0.18)",
            border: "1px dashed rgba(180, 180, 200, 0.45)",
            boxSizing: "border-box",
            pointerEvents: "none",
          }}
        />
      )}

      {showLabel && labelText ? (
        <div
          data-testid={`runtime-hotspot-label-${hotspot.id}`}
          style={{
            position: "absolute",
            left: "50%",
            bottom: "100%",
            transform: `translate(calc(-50% + ${label?.offsetX ?? 0}px), ${
              (label?.offsetY ?? -6) - 4
            }px)`,
            padding: "2px 8px",
            borderRadius: 4,
            background: "rgba(12, 16, 14, 0.82)",
            color: "#F2F4F3",
            fontSize: 12,
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {labelText}
        </div>
      ) : null}
    </div>
  );
}
