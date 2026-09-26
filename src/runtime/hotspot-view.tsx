/**
 * hotspot-view.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.4.0
 *
 * 运行时交互点：可配置悬浮阴影、标签、PNG 剪影 alpha-hit（对齐大地图地点）。
 *
 * 行为要点：
 * - 悬停效果由 hotspot.hoverShadow 经 resolve + buildHoverRuntimeStyle 生成
 * - 有图：透明区 `pointer-events: none`，不挡下方对话框；仅剪影命中时 `auto`
 * - 有图时用 window 级 pointermove 采样（因 none 时收不到元素事件）
 * - 镂空内部仍命中（剪影掩码）
 * - 无图或采样失败 → 整框可点
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultHotspotLabelStyleConfig,
  resolveHotspotLabelAppearance,
} from "../domain/hotspot-label";
import { buildHoverRuntimeStyle } from "../domain/hover-shadow";
import { resolveHotspotHoverShadow } from "../domain/scene-ui-config";
import type {
  HotspotElement,
  HotspotHoverShadow,
  HotspotLabelStyleConfig,
} from "../domain/types";
import {
  applyUiBoxStyle,
  applyUiTextStyle,
} from "../domain/ui-style";
import { isOpaqueImageHit } from "../shared/alpha-hit";
import { getHotspotImageSize, HOTSPOT_FALLBACK_SIZE, type ImageNaturalSize } from "../shared/hotspot-image-size";
import {
  normToWorld,
  type ContentRect,
} from "../shared/scene-layout";

/** 无图时的默认占位边长（设计像素） */
export const RUNTIME_HOTSPOT_PLACEHOLDER_SIZE = HOTSPOT_FALLBACK_SIZE;

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

  /**
   * 全局交互点悬停预设（`SceneUiConfig.hotspotHover`）。
   *
   * 当交互点本地 `hoverShadow.useGlobal !== false` 时跟随该全局预设；
   * 否则使用本地 glow/base。未提供时回退到本地 hoverShadow 规范化结果
   * （兼容旧调用方，等价于 useGlobal=false 且本地为默认）。
   */
  globalHoverShadow?: HotspotHoverShadow;

  /**
   * 全局交互点提示文本外观（`SceneUiConfig.hotspotLabel`）。
   *
   * 当交互点本地 `label.useGlobalStyle !== false` 时跟随该全局预设。
   */
  globalHotspotLabel?: HotspotLabelStyleConfig;

  /**
   * 是否允许悬停滤镜/缩放。
   * 场景转场或交互点层淡入未完成时应为 false，避免显现时播放悬停放大。
   *
   * @default true
   */
  hoverEffectsEnabled?: boolean;
}

/**
 * 判断客户端坐标是否落在元素轴对齐包围盒内。
 *
 * @param el - DOM 元素
 * @param clientX - 指针 clientX
 * @param clientY - 指针 clientY
 * @returns 是否在盒内
 */
function isClientPointInElement(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): boolean {
  const rect = el.getBoundingClientRect();

  return (
    clientX >= rect.left &&
    clientX < rect.right &&
    clientY >= rect.top &&
    clientY < rect.bottom
  );
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
 *
 * @remarks
 * 下方对话框与扩展叠层不同树：`stopPropagation` 无法把点击交给对话框。
 * 有图时必须在透明像素上使用 `pointer-events: none`，否则瓦罐等底部交互点
 * 的大包围盒会挡住对话框（佛像偏上通常无此问题）。
 */
export function HotspotView({
  hotspot,
  contentRect,
  resolveUrl,
  onActivate,
  globalHoverShadow,
  globalHotspotLabel,
  hoverEffectsEnabled = true,
}: HotspotViewProps): React.ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  /** 指针是否落在剪影内（有图时）；无图恒为 true */
  const [alphaHit, setAlphaHit] = useState(false);
  /** 指针是否仍在外壳包围盒内（用于 leave 复位 / hover） */
  const [pointerInside, setPointerInside] = useState(false);
  const [imageNatural, setImageNatural] = useState<(ImageNaturalSize & { url: string }) | null>(null);
  const center = normToWorld(hotspot.x, hotspot.y, contentRect);
  const url = resolveUrl(hotspot.visual.src);
  const size = getHotspotImageSize(hotspot.visual, imageNatural?.url === url ? imageNatural : undefined);
  const hasImage = Boolean(url);
  // 解析运行时实际使用的悬停效果：跟随全局或使用本地
  const resolvedHoverShadow = resolveHotspotHoverShadow(
    hotspot,
    globalHoverShadow ?? hotspot.hoverShadow,
  );
  const labelAppearance = resolveHotspotLabelAppearance(
    hotspot,
    globalHotspotLabel ?? defaultHotspotLabelStyleConfig(),
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
   * - 转场未完成时强制关闭，避免显现瞬间叠加热晕/缩放
   */
  const interactiveHover =
    hoverEffectsEnabled && pointerInside && (!hasImage || alphaHit);

  const hoverStyle = buildHoverRuntimeStyle(
    resolvedHoverShadow,
    interactiveHover,
  );
  const hoverCursor = hoverStyle.cursor ?? "pointer";
  const showLabel =
    labelMode === "always" ||
    (labelMode === "hover" && interactiveHover);

  /**
   * 有图：仅剪影命中时接收指针，透明区放行给下方对话框。
   * 无图：整框可点。
   */
  const rootPointerEvents: "auto" | "none" = hasImage
    ? alphaHit
      ? "auto"
      : "none"
    : "auto";

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
   * 有图时：window 采样包围盒 + alpha。
   * 透明时根节点为 none，收不到元素级 move，必须挂全局。
   */
  useEffect(() => {
    if (!hasImage) {
      return;
    }

    /**
     * @param event - 指针事件
     */
    const onWindowPointerMove = (event: PointerEvent): void => {
      const root = rootRef.current;

      if (root === null) {
        return;
      }

      const inside = isClientPointInElement(
        root,
        event.clientX,
        event.clientY,
      );

      setPointerInside(inside);

      if (!inside) {
        setAlphaHit(false);

        return;
      }

      syncAlphaHit(event.clientX, event.clientY);
    };

    window.addEventListener("pointermove", onWindowPointerMove, {
      passive: true,
    });

    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
    };
  }, [hasImage, syncAlphaHit]);

  /**
   * pointerdown：剪影命中才激活。
   *
   * @param event - 指针事件
   */
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) return;
      const hit = syncAlphaHit(event.clientX, event.clientY);

      if (!hit) {
        return;
      }

      event.stopPropagation();
      onActivate(hotspot);
    },
    [hotspot, onActivate, syncAlphaHit],
  );

  /**
   * 无图占位：元素级 enter/leave/move。
   *
   * @param event - 指针事件
   */
  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (hasImage) {
        return;
      }

      syncAlphaHit(event.clientX, event.clientY);
    },
    [hasImage, syncAlphaHit],
  );

  /**
   * @param event - 指针事件
   */
  const handlePointerEnter = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (hasImage) {
        return;
      }

      setPointerInside(true);
      syncAlphaHit(event.clientX, event.clientY);
    },
    [hasImage, syncAlphaHit],
  );

  const handlePointerLeave = useCallback((): void => {
    if (hasImage) {
      return;
    }

    setPointerInside(false);
    setAlphaHit(false);
  }, [hasImage]);

  return (
    <div
      ref={rootRef}
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
        cursor: hasImage
          ? alphaHit
            ? hoverCursor
            : "default"
          : hoverCursor,
        pointerEvents: rootPointerEvents,
        overflow: "visible",
        filter: hoverStyle.filter,
        transform: hoverStyle.transform,
        transformOrigin: "center center",
        transition: hoverStyle.transition,
      }}
    >
      {url ? (
        <img
          key={url}
          ref={imgRef}
          src={url}
          alt=""
          draggable={false}
          // 尽量允许 canvas 采样；跨域失败时 isOpaqueImageHit 回退整框
          crossOrigin="anonymous"
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              setImageNatural({ url, width: img.naturalWidth, height: img.naturalHeight });
            }
          }}
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
        <>
          {labelAppearance.customCss.trim() ? (
            <style>{`[data-testid="runtime-hotspot-label-${hotspot.id}"] { ${labelAppearance.customCss} }`}</style>
          ) : null}
          <div
            data-testid={`runtime-hotspot-label-${hotspot.id}`}
            style={{
              position: "absolute",
              left: "50%",
              bottom: "100%",
              transform: `translate(calc(-50% + ${label?.offsetX ?? 0}px), ${
                (label?.offsetY ?? -6) - 4
              }px)`,
              padding: `${labelAppearance.paddingY}px ${labelAppearance.paddingX}px`,
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              maxWidth: labelAppearance.maxWidth,
              overflow: "hidden",
              textOverflow: "ellipsis",
              boxSizing: "border-box",
              ...applyUiBoxStyle(labelAppearance.style),
              ...applyUiTextStyle(labelAppearance.style),
            }}
          >
            {labelText}
          </div>
        </>
      ) : null}
    </div>
  );
}
