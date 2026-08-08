/**
 * hud-visual-canvas.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.5.0
 *
 * 快捷栏 HUD 自由布局画布：
 * - 左侧 NodeList 选节点
 * - 设计分辨率 letterbox 舞台上渲染 resolveHudLayout 的 8 槽 + 打开背包按钮
 * - 拖拽 / resize（applyDrag / applyResize）+ SelectionOverlay
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveHudLayout } from "../../domain/hud-layout";
import type { ResolvedHudLayout } from "../../domain/hud-layout";
import {
  applyUiBoxStyle,
  applyUiTextStyle,
} from "../../domain/ui-style";
import type { InventoryHudConfig, UiRect } from "../../domain/types";
import type { HudNodeId } from "../../schema/inventory-hud-schema";
import { fitDesignToHost } from "../../shared/scene-layout";
import { useTheme } from "../../theme/theme-provider";
import {
  applyDrag,
  applyResize,
  type ResizeHandle,
} from "./free-layout-selection";
import { NodeList, type NodeListItem } from "./node-list";
import { SelectionOverlay } from "./selection-overlay";

/** HUD 画布侧栏固定节点条目 */
const HUD_NODE_ITEMS: readonly NodeListItem[] = [
  { id: "quickbarRoot", label: "快捷栏" },
  { id: "openBagButton", label: "打开背包" },
];

/**
 * HudVisualCanvas 属性。
 */
export interface HudVisualCanvasProps {
  /** 设计宽（舞台像素） */
  designWidth: number;

  /** 设计高（舞台像素） */
  designHeight: number;

  /** 当前 HUD 配置 */
  hud: InventoryHudConfig;

  /** 当前选中节点；无选中时为 null */
  selectedNodeId: HudNodeId | null;

  /**
   * 选中节点变化。
   *
   * @param id - 节点 id，或 null 表示清空选中
   */
  onSelectNode: (id: HudNodeId | null) => void;

  /**
   * 拖拽 / resize / 布局切换时回写完整 HUD 配置。
   *
   * @param next - 新配置
   */
  onHudChange: (next: InventoryHudConfig) => void;
}

/**
 * 指针会话：拖拽节点或缩放 absolute 按钮。
 */
type PointerSession =
  | {
      kind: "drag";
      nodeId: HudNodeId;
      startX: number;
      startY: number;
      origin: { x: number; y: number };
      scale: number;
    }
  | {
      kind: "resize";
      handle: ResizeHandle;
      startX: number;
      startY: number;
      origin: Required<UiRect>;
      scale: number;
    };

/**
 * 由 8 槽矩形求快捷栏根的包围盒（不含 belowRoot 按钮）。
 *
 * @param slots - resolveHudLayout.slots
 * @returns 设计像素包围盒（含 w/h）；无槽时回退 0 尺寸
 */
function slotsBoundingRect(
  slots: ResolvedHudLayout["slots"],
): Required<UiRect> {
  if (slots.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  let minX = slots[0].x;
  let minY = slots[0].y;
  let maxX = slots[0].x + slots[0].w;
  let maxY = slots[0].y + slots[0].h;

  for (let i = 1; i < slots.length; i += 1) {
    const s = slots[i];

    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.w);
    maxY = Math.max(maxY, s.y + s.h);
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

/**
 * 为拖拽构造边缘吸附目标（设计边界 + 另一节点边）。
 *
 * @param nodeId - 正在拖拽的节点
 * @param layout - 当前解析布局
 * @param designWidth - 设计宽
 * @param designHeight - 设计高
 * @returns snapX / snapY 目标列表
 */
function snapTargetsFor(
  nodeId: HudNodeId,
  layout: ResolvedHudLayout,
  designWidth: number,
  designHeight: number,
): { snapX: number[]; snapY: number[] } {
  const snapX = [0, designWidth];
  const snapY = [0, designHeight];

  if (nodeId === "quickbarRoot") {
    const b = layout.openBagButton;

    snapX.push(b.x, b.x + b.w);
    snapY.push(b.y, b.y + b.h);
  } else {
    const box = slotsBoundingRect(layout.slots);

    snapX.push(box.x, box.x + box.w);
    snapY.push(box.y, box.y + box.h);
  }

  return { snapX, snapY };
}

/**
 * 快捷栏 HUD 自由布局可视化编辑画布。
 *
 * @param props - HudVisualCanvasProps
 * @returns 左侧节点列表 + letterbox 舞台
 *
 * @example
 * ```tsx
 * <HudVisualCanvas
 *   designWidth={1920}
 *   designHeight={1080}
 *   hud={hud}
 *   selectedNodeId={selected}
 *   onSelectNode={setSelected}
 *   onHudChange={persistHud}
 * />
 * ```
 *
 * @throws 无（非法尺寸由 fitDesignToHost / resolveHudLayout 侧钳制）
 */
export function HudVisualCanvas({
  designWidth,
  designHeight,
  hud,
  selectedNodeId,
  onSelectNode,
  onHudChange,
}: HudVisualCanvasProps): React.ReactElement {
  const { tokens } = useTheme();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
  const sessionRef = useRef<PointerSession | null>(null);

  /** 指针会话中读取最新配置，避免闭包过期 */
  const hudRef = useRef(hud);
  const layoutRef = useRef<ResolvedHudLayout | null>(null);

  hudRef.current = hud;

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

  /**
   * Esc 清空选中。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onSelectNode(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSelectNode]);

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
   * 共享布局：与运行时 resolveHudLayout 一致。
   */
  const layout = useMemo(() => resolveHudLayout(hud), [hud]);

  layoutRef.current = layout;

  const openBagLabel = layout.openBagStyle.label || "打开背包";
  const buttonIsAbsolute = hud.nodes.openBagButton.layout === "absolute";

  /**
   * 预览强调色：配置优先，空串回退主题 accent。
   */
  const accent =
    typeof layout.accent === "string" && layout.accent.trim().length > 0
      ? layout.accent.trim()
      : tokens.accent;

  /**
   * 选中叠层矩形：快捷栏用槽包围盒；按钮用解析后的 openBagButton。
   */
  const selectionRect = useMemo((): Required<UiRect> | null => {
    if (selectedNodeId === "quickbarRoot") {
      return slotsBoundingRect(layout.slots);
    }

    if (selectedNodeId === "openBagButton") {
      const b = layout.openBagButton;

      return { x: b.x, y: b.y, w: b.w, h: b.h };
    }

    return null;
  }, [selectedNodeId, layout.slots, layout.openBagButton]);

  /**
   * 窗口级 pointermove / pointerup：在会话期间应用 applyDrag / applyResize。
   */
  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      const session = sessionRef.current;
      const currentLayout = layoutRef.current;

      if (!session || !currentLayout) {
        return;
      }

      const dx = (event.clientX - session.startX) / session.scale;
      const dy = (event.clientY - session.startY) / session.scale;
      const currentHud = hudRef.current;

      if (session.kind === "drag") {
        const snaps = snapTargetsFor(
          session.nodeId,
          currentLayout,
          designWidth,
          designHeight,
        );
        const nextPos = applyDrag(session.origin, dx, dy, {
          shiftKey: event.shiftKey,
          snapX: snaps.snapX,
          snapY: snaps.snapY,
        });
        const nextX = Math.max(0, Math.round(nextPos.x));
        const nextY = Math.max(0, Math.round(nextPos.y));

        if (session.nodeId === "quickbarRoot") {
          const prev = currentHud.nodes.quickbarRoot.rect;

          if (nextX === prev.x && nextY === prev.y) {
            return;
          }

          onHudChange({
            ...currentHud,
            nodes: {
              ...currentHud.nodes,
              quickbarRoot: {
                ...currentHud.nodes.quickbarRoot,
                rect: { x: nextX, y: nextY },
              },
            },
          });

          return;
        }

        const prevRect = currentHud.nodes.openBagButton.rect;
        const prevW =
          typeof prevRect?.w === "number" && prevRect.w > 0
            ? prevRect.w
            : currentLayout.openBagButton.w;
        const prevH =
          typeof prevRect?.h === "number" && prevRect.h > 0
            ? prevRect.h
            : currentLayout.openBagButton.h;

        if (
          prevRect &&
          nextX === prevRect.x &&
          nextY === prevRect.y &&
          currentHud.nodes.openBagButton.layout === "absolute"
        ) {
          return;
        }

        onHudChange({
          ...currentHud,
          nodes: {
            ...currentHud.nodes,
            openBagButton: {
              ...currentHud.nodes.openBagButton,
              layout: "absolute",
              rect: { x: nextX, y: nextY, w: prevW, h: prevH },
            },
          },
        });

        return;
      }

      // resize：仅 absolute 打开背包按钮
      if (currentHud.nodes.openBagButton.layout !== "absolute") {
        return;
      }

      const nextRect = applyResize(session.origin, session.handle, dx, dy);
      const rounded: Required<UiRect> = {
        x: Math.round(nextRect.x),
        y: Math.round(nextRect.y),
        w: Math.round(nextRect.w),
        h: Math.round(nextRect.h),
      };
      const prev = currentHud.nodes.openBagButton.rect;

      if (
        prev &&
        prev.x === rounded.x &&
        prev.y === rounded.y &&
        prev.w === rounded.w &&
        prev.h === rounded.h
      ) {
        return;
      }

      onHudChange({
        ...currentHud,
        nodes: {
          ...currentHud.nodes,
          openBagButton: {
            ...currentHud.nodes.openBagButton,
            layout: "absolute",
            rect: rounded,
          },
        },
      });
    };

    const onPointerUp = (): void => {
      sessionRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [designWidth, designHeight, onHudChange]);

  /**
   * 开始拖拽快捷栏根：选中并记录原点。
   *
   * @param event - 指针事件
   */
  const beginDragQuickbar = useCallback(
    (event: React.PointerEvent): void => {
      event.stopPropagation();
      event.preventDefault();
      onSelectNode("quickbarRoot");
      sessionRef.current = {
        kind: "drag",
        nodeId: "quickbarRoot",
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: layout.root.x, y: layout.root.y },
        scale,
      };
    },
    [layout.root.x, layout.root.y, onSelectNode, scale],
  );

  /**
   * 开始拖拽打开背包按钮。
   *
   * belowRoot 时立即改为 absolute 并写入当前解析位置，再进入拖拽会话。
   *
   * @param event - 指针事件
   */
  const beginDragOpenBag = useCallback(
    (event: React.PointerEvent): void => {
      event.stopPropagation();
      event.preventDefault();
      onSelectNode("openBagButton");

      const btn = layout.openBagButton;
      const currentHud = hudRef.current;

      if (currentHud.nodes.openBagButton.layout !== "absolute") {
        onHudChange({
          ...currentHud,
          nodes: {
            ...currentHud.nodes,
            openBagButton: {
              ...currentHud.nodes.openBagButton,
              layout: "absolute",
              rect: { x: btn.x, y: btn.y, w: btn.w, h: btn.h },
            },
          },
        });
      }

      sessionRef.current = {
        kind: "drag",
        nodeId: "openBagButton",
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: btn.x, y: btn.y },
        scale,
      };
    },
    [layout.openBagButton, onHudChange, onSelectNode, scale],
  );

  /**
   * SelectionOverlay 手柄按下：开启 resize 会话（仅 absolute 按钮）。
   *
   * @param handle - 八向手柄
   * @param event - 指针事件
   */
  const onResizeStart = useCallback(
    (handle: ResizeHandle, event: React.PointerEvent<HTMLDivElement>): void => {
      if (!buttonIsAbsolute) {
        return;
      }

      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);

      const btn = layout.openBagButton;

      sessionRef.current = {
        kind: "resize",
        handle,
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: btn.x, y: btn.y, w: btn.w, h: btn.h },
        scale,
      };
    },
    [buttonIsAbsolute, layout.openBagButton, scale],
  );

  /**
   * 侧栏选中（NodeList 回调 id 为 string）。
   *
   * @param id - 节点 id
   */
  const onNodeListSelect = useCallback(
    (id: string): void => {
      if (id === "quickbarRoot" || id === "openBagButton") {
        onSelectNode(id);
      }
    },
    [onSelectNode],
  );

  /**
   * 点击舞台空白：清空选中。
   */
  const onStagePointerDown = useCallback((): void => {
    onSelectNode(null);
  }, [onSelectNode]);

  const slotBoxCss = applyUiBoxStyle(layout.slotStyle);
  const openBagBoxCss = applyUiBoxStyle(layout.openBagStyle);
  const openBagTextCss = applyUiTextStyle(layout.openBagStyle);

  return (
    <div
      data-testid="hud-visual-canvas"
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        background: tokens.bgSunken,
      }}
    >
      <div
        style={{
          width: 168,
          flexShrink: 0,
          minHeight: 0,
        }}
      >
        <NodeList
          items={HUD_NODE_ITEMS}
          selectedId={selectedNodeId}
          onSelect={onNodeListSelect}
        />
      </div>

      <div
        ref={hostRef}
        data-testid="hud-visual-host"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
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
              onPointerDown={onStagePointerDown}
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
                HUD · 自由布局 · Esc 取消选中
              </div>

              {layout.slots.map((slot, index) => (
                <div
                  key={`slot-${index}`}
                  data-testid="hud-visual-slot"
                  data-slot-index={index}
                  onPointerDown={beginDragQuickbar}
                  style={{
                    position: "absolute",
                    left: slot.x,
                    top: slot.y,
                    width: slot.w,
                    height: slot.h,
                    boxSizing: "border-box",
                    borderRadius: 8,
                    border: `1px solid ${accent}59`,
                    background: "rgba(20,28,36,0.9)",
                    cursor: "grab",
                    touchAction: "none",
                    userSelect: "none",
                    ...slotBoxCss,
                  }}
                />
              ))}

              <div
                data-testid="hud-visual-open-bag"
                onPointerDown={beginDragOpenBag}
                style={{
                  position: "absolute",
                  left: layout.openBagButton.x,
                  top: layout.openBagButton.y,
                  width: layout.openBagButton.w,
                  height: layout.openBagButton.h,
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  background: accent,
                  color: "#0B1210",
                  cursor: "grab",
                  touchAction: "none",
                  userSelect: "none",
                  ...openBagBoxCss,
                  ...openBagTextCss,
                }}
              >
                {openBagLabel}
              </div>

              {selectionRect ? (
                <SelectionOverlay
                  rect={selectionRect}
                  scale={scale}
                  resizable={
                    selectedNodeId === "openBagButton" && buttonIsAbsolute
                  }
                  accentColor={accent}
                  onResizeStart={onResizeStart}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
