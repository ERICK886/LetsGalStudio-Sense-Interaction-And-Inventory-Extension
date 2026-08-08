/**
 * backpack-visual-canvas.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.9
 *
 * 全屏背包布局可视化预览：设计分辨率 letterbox（flex 居中）。
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BackpackScreenConfig } from "../../domain/types";
import { fitDesignToHost } from "../../shared/scene-layout";
import { useTheme } from "../../theme/theme-provider";

/**
 * BackpackVisualCanvas 属性。
 */
export interface BackpackVisualCanvasProps {
  designWidth: number;
  designHeight: number;
  config: BackpackScreenConfig;
}

/**
 * @param props - BackpackVisualCanvasProps
 * @returns 预览画布
 */
export function BackpackVisualCanvas({
  designWidth,
  designHeight,
  config,
}: BackpackVisualCanvasProps): React.ReactElement {
  const { tokens } = useTheme();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });

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
  const detailPct = Math.round(config.detailRatio * 100);
  const gridPct = 100 - detailPct;
  const accent = config.accent || "#64e0d0";

  return (
    <div
      ref={hostRef}
      data-testid="backpack-visual-canvas"
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
          data-testid="backpack-visual-frame"
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
            data-testid="backpack-visual-stage"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: designWidth,
              height: designHeight,
              transform: `scale(${scale})`,
              transformOrigin: "0 0",
              background: "#05080c",
              boxSizing: "border-box",
              padding: `${config.pagePaddingY}px ${config.pagePaddingX}px`,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              color: "#f2f5f7",
              fontFamily:
                '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
            }}
          >
            <div>
              <div
                style={{
                  color: accent,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.22em",
                  marginBottom: 6,
                }}
              >
                INVENTORY
              </div>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 750,
                  letterSpacing: "0.04em",
                }}
              >
                道具
              </div>
              <div
                style={{
                  marginTop: 10,
                  width: 44,
                  height: 3,
                  borderRadius: 2,
                  background: accent,
                }}
              />
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "grid",
                gridTemplateColumns: `minmax(0, ${gridPct}%) minmax(0, ${detailPct}%)`,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(14, 18, 24, 0.92)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  borderRight: "1px solid rgba(255,255,255,0.08)",
                  padding: 16,
                  display: "grid",
                  gridTemplateColumns: `repeat(auto-fill, minmax(${config.gridCellMin}px, 1fr))`,
                  gap: 12,
                  alignContent: "start",
                  background: "rgba(10, 14, 20, 0.55)",
                }}
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <div
                    key={`cell-${i}`}
                    style={{
                      aspectRatio: "1 / 1",
                      borderRadius: 12,
                      border:
                        i === 0
                          ? `1px solid ${accent}`
                          : "1px solid rgba(255,255,255,0.08)",
                      background:
                        i === 0 ? `${accent}22` : "rgba(255,255,255,0.03)",
                    }}
                  />
                ))}
              </div>

              <div
                style={{
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    height: config.heroHeight,
                    maxHeight: "34%",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: `linear-gradient(145deg, ${accent}33 0%, #0d1a28 55%, #0a1220 100%)`,
                  }}
                />
                <div style={{ fontSize: 28, fontWeight: 750 }}>物品名称</div>
                <div style={{ color: accent, fontSize: 14 }}>持有 ×1</div>
                <div style={{ color: "rgba(220,230,235,0.7)", fontSize: 14 }}>
                  详情预览区（布局随右侧参数变化）
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
