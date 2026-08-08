/**
 * hotspot-view.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 运行时交互点：悬浮阴影、标签、alpha-hit 点击判定。
 */

import React, { useCallback, useRef, useState } from "react";
import type { HotspotElement } from "../domain/types";
import { isOpaqueAt } from "../shared/alpha-hit";
import {
  normToWorld,
  type ContentRect,
} from "../shared/scene-layout";

/** 无图时的默认占位边长（设计像素） */
export const RUNTIME_HOTSPOT_PLACEHOLDER_SIZE = 64;

/** 默认悬浮阴影 CSS filter */
const DEFAULT_HOVER_DROP_SHADOW =
  "drop-shadow(0 0 10px rgba(255, 236, 160, 0.85)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45))";

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
 * 将显示框内本地坐标映射到图片自然像素（object-fit: contain）。
 *
 * @param img - 已加载图片
 * @param localX - 相对显示框左上的 X
 * @param localY - 相对显示框左上的 Y
 * @param displayW - 显示框宽
 * @param displayH - 显示框高
 * @returns 自然像素坐标；落在 contain 留白区时返回 null（视为透明）
 */
function mapLocalToNatural(
  img: HTMLImageElement,
  localX: number,
  localY: number,
  displayW: number,
  displayH: number,
): { x: number; y: number } | null {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;

  if (!(nw > 0) || !(nh > 0) || !(displayW > 0) || !(displayH > 0)) {
    return null;
  }

  const scale = Math.min(displayW / nw, displayH / nh);
  const drawnW = nw * scale;
  const drawnH = nh * scale;
  const offsetX = (displayW - drawnW) / 2;
  const offsetY = (displayH - drawnH) / 2;
  const x = (localX - offsetX) / scale;
  const y = (localY - offsetY) / scale;

  if (x < 0 || y < 0 || x >= nw || y >= nh) {
    return null;
  }

  return { x, y };
}

/**
 * 运行时单个交互点视图。
 *
 * - `hoverShadow.enabled` 且 hover → CSS `filter: drop-shadow(...)`
 * - 有图时 mousedown 前做 alpha-hit；透明像素忽略点击
 * - 无图或采样失败 → 整框可点（与 `isOpaqueAt` 回退一致）
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
  const [hovered, setHovered] = useState(false);

  const size = hotspotDisplaySize(hotspot);
  const center = normToWorld(hotspot.x, hotspot.y, contentRect);
  const url = resolveUrl(hotspot.visual.src);
  const shadowEnabled = hotspot.hoverShadow?.enabled !== false;
  const showShadow = shadowEnabled && hovered;

  const label = hotspot.label;
  const labelText =
    label !== undefined && label.text.trim() !== ""
      ? label.text
      : hotspot.name;
  const labelMode = label?.mode ?? "hover";
  const showLabel =
    labelMode === "always" || (labelMode === "hover" && hovered);

  /**
   * mousedown：优先 alpha-hit，透明则忽略。
   *
   * @param event - 鼠标事件
   */
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      event.stopPropagation();

      const img = imgRef.current;

      if (img !== null && url) {
        const rect = event.currentTarget.getBoundingClientRect();
        const localX = event.clientX - rect.left;
        const localY = event.clientY - rect.top;
        // getBoundingClientRect 含 CSS scale；用 offsetWidth/Height 更接近设计像素显示框
        const displayW = event.currentTarget.offsetWidth;
        const displayH = event.currentTarget.offsetHeight;
        // client 坐标相对缩放后的盒子，需按比例映射到 offset 尺寸
        const mappedX =
          rect.width > 0 ? (localX / rect.width) * displayW : localX;
        const mappedY =
          rect.height > 0 ? (localY / rect.height) * displayH : localY;

        const natural = mapLocalToNatural(
          img,
          mappedX,
          mappedY,
          displayW,
          displayH,
        );

        if (natural === null) {
          return;
        }

        if (!isOpaqueAt(img, natural.x, natural.y)) {
          return;
        }
      }

      onActivate(hotspot);
    },
    [hotspot, onActivate, url],
  );

  return (
    <div
      data-testid={`runtime-hotspot-${hotspot.id}`}
      data-hotspot-id={hotspot.id}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        left: center.x - size.width / 2,
        top: center.y - size.height / 2,
        width: size.width,
        height: size.height,
        boxSizing: "border-box",
        cursor: "pointer",
        pointerEvents: "auto",
        overflow: "visible",
        filter: showShadow ? DEFAULT_HOVER_DROP_SHADOW : undefined,
        transition: "filter 120ms ease-out",
      }}
    >
      {url ? (
        <img
          ref={imgRef}
          src={url}
          alt=""
          draggable={false}
          // 尽量允许 canvas 采样；跨域失败时 alpha-hit 会回退整框
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
