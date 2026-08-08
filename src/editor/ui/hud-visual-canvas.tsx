/**
 * hud-visual-canvas.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.4.0
 *
 * 快捷栏 HUD 可视化画布：设计分辨率 letterbox（flex 居中）+ 可拖拽快捷栏预览。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveHudLayout } from "../../domain/hud-layout";
import { QUICKBAR_SLOTS } from "../../domain/inventory";
import type { InventoryHudConfig } from "../../domain/types";
import { fitDesignToHost } from "../../shared/scene-layout";
import { useTheme } from "../../theme/theme-provider";

/**
 * HudVisualCanvas 属性。
 */
export interface HudVisualCanvasProps {
  /** 设计宽 */
  designWidth: number;

  /** 设计高 */
  designHeight: number;

  /** 当前 HUD 配置 */
  hud: InventoryHudConfig;

  /**
   * 拖拽或尺寸变化时回写。
   *
   * @param next - 新配置
   */
  onHudChange: (next: InventoryHudConfig) => void;
}

/**
 * 快捷栏可视化编辑画布。
 *
 * @param props - HudVisualCanvasProps
 * @returns 画布
 *
 * @example
 * ```tsx
 * <HudVisualCanvas
 *   designWidth={1920}
 *   designHeight={1080}
 *   hud={hud}
 *   onHudChange={setHud}
 * />
 * ```
 */
export function HudVisualCanvas({
  designWidth,
  designHeight,
  hud,
  onHudChange,
}: HudVisualCanvasProps): React.ReactElement {
  const { tokens } = useTheme();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    scale: number;
  } | null>(null);

  useEffect(() => {
    const el = hostRef.current;

    if (!el) {
      return;
    }

    const measure = (): void => {
      const rect = el.getBoundingClientRect();

      setHostSize({
        w: Math.max(0, rect.width),
        h: Math.max(0, rect.height),
      });
    };

    measure();
    const ro = new ResizeObserver(measure);

    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  const world = useMemo(
    () =>
      fitDesignToHost(
        Math.max(1, hostSize.w),
        Math.max(1, hostSize.h),
        designWidth,
        designHeight,
        0.92,
      ),
    [hostSize.w, hostSize.h, designWidth, designHeight],
  );

  const scale = world.scale > 0 ? world.scale : 0.001;
  const frameW = designWidth * scale;
  const frameH = designHeight * scale;

  /**
   * 共享布局：根定位 / 槽几何与运行时 resolveHudLayout 一致。
   */
  const layout = useMemo(() => resolveHudLayout(hud), [hud]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent): void => {
      event.preventDefault();
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originLeft: layout.root.x,
        originTop: layout.root.y,
        scale,
      };
    },
    [layout.root.x, layout.root.y, scale],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent): void => {
      const drag = dragRef.current;

      if (!drag) {
        return;
      }

      const dx = (event.clientX - drag.startX) / drag.scale;
      const dy = (event.clientY - drag.startY) / drag.scale;
      const nextLeft = Math.max(0, Math.round(drag.originLeft + dx));
      const nextTop = Math.max(0, Math.round(drag.originTop + dy));

      if (nextLeft === layout.root.x && nextTop === layout.root.y) {
        return;
      }

      onHudChange({
        ...hud,
        nodes: {
          ...hud.nodes,
          quickbarRoot: {
            ...hud.nodes.quickbarRoot,
            rect: { x: nextLeft, y: nextTop },
          },
        },
      });
    },
    [hud, layout.root.x, layout.root.y, onHudChange],
  );

  const onPointerUp = useCallback((): void => {
    dragRef.current = null;
  }, []);

  const slotSize = layout.root.slotSize > 0 ? layout.root.slotSize : 64;
  const gap = layout.root.gap >= 0 ? layout.root.gap : 8;
  const openBagLabel = layout.openBagStyle.label || "打开背包";

  /**
   * 预览强调色：配置优先，空串回退主题 accent。
   */
  const accent =
    typeof layout.accent === "string" && layout.accent.trim().length > 0
      ? layout.accent.trim()
      : tokens.accent;

  return (
    <div
      ref={hostRef}
      data-testid="hud-visual-canvas"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        position: "relative",
        overflow: "hidden",
        background: tokens.bgSunken,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {hostSize.w > 0 && hostSize.h > 0 ? (
        <div
          data-testid="hud-visual-frame"
          style={{
            width: frameW,
            height: frameH,
            position: "relative",
            flexShrink: 0,
            boxShadow: "0 0 0 1px rgba(255,255,255,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            data-testid="hud-visual-stage"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: designWidth,
              height: designHeight,
              transform: `scale(${scale})`,
              transformOrigin: "0 0",
              background:
                "linear-gradient(160deg, #0c1218 0%, #151c24 50%, #0a1016 100%)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 16,
                top: 16,
                fontSize: 12,
                color: "rgba(255,255,255,0.35)",
                letterSpacing: "0.12em",
                pointerEvents: "none",
              }}
            >
              HUD PREVIEW · 拖拽快捷栏定位
            </div>

            <div
              data-testid="hud-visual-quickbar"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                position: "absolute",
                left: layout.root.x,
                top: layout.root.y,
                display: "flex",
                flexDirection: layout.root.direction,
                gap,
                cursor: "grab",
                touchAction: "none",
                userSelect: "none",
              }}
            >
              {Array.from({ length: QUICKBAR_SLOTS }, (_, index) => (
                <div
                  key={`slot-${index}`}
                  style={{
                    width: slotSize,
                    height: slotSize,
                    borderRadius: 8,
                    border: `1px solid ${accent}59`,
                    background: "rgba(20,28,36,0.9)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                  }}
                />
              ))}
              <div
                style={{
                  marginTop: 4,
                  borderRadius: 8,
                  padding: "8px 10px",
                  background: accent,
                  color: "#0B1210",
                  fontSize: 13,
                  fontWeight: 650,
                  textAlign: "center",
                }}
              >
                {openBagLabel}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
