import { chakra } from "@chakra-ui/react";
/**
 * hud-visual-canvas.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.6.0
 *
 * 快捷栏 HUD 自由布局画布：
 * - 左侧 NodeList 选节点（支持 Shift 多选）
 * - 舞台渲染 8 槽 + overlays（打开背包为 role=openBag 按钮组件）
 * - 槽组包围盒透明 hit 层：点击槽间隙也可选中 / 拖拽 quickbarRoot
 * - 拖拽 / resize（applyDrag / applyResize）+ 多选 SelectionOverlay
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveHudLayout } from "../../domain/hud-layout";
import type { ResolvedHudLayout } from "../../domain/hud-layout";
import { applyUiBoxStyle } from "../../domain/ui-style";
import { HUD_FIXED_LAYER_IDS } from "../../domain/inventory-hud";
import {
  buildDefaultLayerOrder,
  layerZIndex,
  sortItemsByLayerOrder,
  syncOverlaysZIndexFromLayerOrder,
} from "../../domain/layer-order";
import type { InventoryHudConfig, UiRect } from "../../domain/types";
import {
  overlaySelectionId,
  parseOverlaySelectionId,
  UI_OVERLAY_KIND_ICONS,
  UI_OVERLAY_KIND_LABELS,
} from "../../domain/ui-overlay";
import type { HudNodeId } from "../../schema/inventory-hud-schema";
import { UiOverlayLayer } from "../../runtime/ui-overlay-layer";
import { fitDesignToHost } from "../../shared/scene-layout";
import { useTheme } from "../../theme/theme-provider";
import {
  applyDrag,
  applyResize,
  arrowNudgeDelta,
  isEditableKeyboardTarget,
  nudgeOrigin,
  type ResizeHandle,
} from "./free-layout-selection";
import { NodeList, type NodeListItem } from "./node-list";
import { SelectionOverlay } from "./selection-overlay";

/** HUD 画布侧栏固定节点条目（打开背包已迁为 overlay 按钮组件） */
const HUD_NODE_ITEMS: readonly NodeListItem[] = [
  { id: "quickbarRoot", label: "快捷栏", icon: "grip" },
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

  /**
   * 当前选中节点 id 列表（多选）；无选中时为空数组。
   */
  /**
   * 选中 id：角色节点（quickbarRoot / openBagButton）或 `overlay:<id>`。
   */
  selectedNodeIds: readonly string[];

  /**
   * 选中节点变化。
   *
   * @param id - 节点 / 图层 id，或 null 表示清空选中
   * @param shiftKey - 是否按住 Shift（切换多选）；清空时忽略
   */
  onSelectNode: (id: string | null, shiftKey?: boolean) => void;

  /**
   * 拖拽 / resize / 布局切换时回写完整 HUD 配置。
   *
   * @param next - 新配置
   */
  onHudChange: (next: InventoryHudConfig) => void;

  /**
   * 连续动作开始（pointerdown）：撤销栈记录动作前状态为当前栈顶。
   */
  onActionStart?: () => void;

  /**
   * 连续动作结束（pointerup）：与 onHudChange 配合，整段拖拽只占一步撤销。
   */
  onActionEnd?: () => void;
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
      kind: "overlay-drag";
      overlayId: string;
      startX: number;
      startY: number;
      origin: { x: number; y: number };
      scale: number;
    }
  | {
      kind: "overlay-resize";
      overlayId: string;
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
 * 解析某 HUD 节点的选中叠层矩形。
 *
 * @param nodeId - 节点 id
 * @param layout - 当前解析布局
 * @returns 设计像素矩形；未知 id 时返回 null
 */
function selectionRectFor(
  nodeId: string,
  layout: ResolvedHudLayout,
  hud: InventoryHudConfig,
): Required<UiRect> | null {
  const overlayId = parseOverlaySelectionId(nodeId);

  if (overlayId !== null) {
    const el = (hud.overlays ?? []).find((o) => o.id === overlayId);

    return el ? { ...el.rect } : null;
  }

  if (nodeId === "quickbarRoot") {
    return slotsBoundingRect(layout.slots);
  }

  return null;
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
 *   selectedNodeIds={["quickbarRoot"]}
 *   onSelectNode={(id, shiftKey) => ...}
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
  selectedNodeIds,
  onSelectNode,
  onHudChange,
  onActionStart,
  onActionEnd,
}: HudVisualCanvasProps): React.ReactElement {
  const { tokens } = useTheme();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
  /**
   * 拖拽 / resize 期间的本地草稿：避免每帧 persist（history 深拷贝 + settings）
   * 导致元件跟不上指针。
   */
  const [dragDraft, setDragDraft] = useState<InventoryHudConfig | null>(null);
  const sessionRef = useRef<PointerSession | null>(null);
  const dragDirtyRef = useRef(false);
  const actionOpenRef = useRef(false);

  /** 指针会话中读取最新配置，避免闭包过期 */
  const hudRef = useRef(hud);
  const layoutRef = useRef<ResolvedHudLayout | null>(null);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const onHudChangeRef = useRef(onHudChange);
  const onActionStartRef = useRef(onActionStart);
  const onActionEndRef = useRef(onActionEnd);

  onHudChangeRef.current = onHudChange;
  onActionStartRef.current = onActionStart;
  onActionEndRef.current = onActionEnd;
  selectedNodeIdsRef.current = selectedNodeIds;

  const displayHud = dragDraft ?? hud;

  hudRef.current = displayHud;

  useEffect(() => {
    const el = hostRef.current;

    if (!el) {
      return;
    }

    const measure = (): void => {
      setHostSize({
        w: Math.max(0, el.clientWidth),
        h: Math.max(0, el.clientHeight),
      });
    };

    measure();
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry) {
        setHostSize({
          w: Math.max(0, entry.contentRect.width),
          h: Math.max(0, entry.contentRect.height),
        });

        return;
      }

      measure();
    });

    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  /**
   * Esc 清空选中；方向键微调选中元素（1px，Shift=10px）。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onSelectNode(null);

        return;
      }

      const delta = arrowNudgeDelta(event.key, event.shiftKey);

      if (!delta) {
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (sessionRef.current) {
        return;
      }

      const ids = selectedNodeIdsRef.current;

      if (ids.length === 0) {
        return;
      }

      event.preventDefault();

      let next = hudRef.current;
      let changed = false;

      for (const nodeId of ids) {
        const overlayId = parseOverlaySelectionId(nodeId);

        if (overlayId !== null) {
          const overlays = next.overlays ?? [];
          const idx = overlays.findIndex((o) => o.id === overlayId);

          if (idx < 0) {
            continue;
          }

          const prev = overlays[idx]!;
          const origin = nudgeOrigin(prev.rect, delta.dx, delta.dy);

          if (origin.x === prev.rect.x && origin.y === prev.rect.y) {
            continue;
          }

          const nextOverlays = overlays.slice();
          nextOverlays[idx] = {
            ...prev,
            rect: { ...prev.rect, x: origin.x, y: origin.y },
          };
          next = { ...next, overlays: nextOverlays };
          changed = true;
          continue;
        }

        if (nodeId !== "quickbarRoot") {
          continue;
        }

        const prev = next.nodes.quickbarRoot.rect;
        const origin = nudgeOrigin(
          { x: prev.x ?? 0, y: prev.y ?? 0 },
          delta.dx,
          delta.dy,
        );

        if (origin.x === (prev.x ?? 0) && origin.y === (prev.y ?? 0)) {
          continue;
        }

        next = {
          ...next,
          nodes: {
            ...next.nodes,
            quickbarRoot: {
              ...next.nodes.quickbarRoot,
              rect: { x: origin.x, y: origin.y },
            },
          },
        };
        changed = true;
      }

      if (changed) {
        onHudChangeRef.current(next);
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
   * 共享布局：与运行时 resolveHudLayout 一致（含拖拽草稿）。
   */
  const layout = useMemo(() => resolveHudLayout(displayHud), [displayHud]);

  layoutRef.current = layout;

  const layerOrder = useMemo(
    () =>
      displayHud.layerOrder ??
      buildDefaultLayerOrder(HUD_FIXED_LAYER_IDS, displayHud.overlays),
    [displayHud.layerOrder, displayHud.overlays],
  );

  const overlayItems: NodeListItem[] = useMemo(
    () =>
      (displayHud.overlays ?? []).map((el) => ({
        id: overlaySelectionId(el.id),
        label: `${UI_OVERLAY_KIND_LABELS[el.kind]} · ${el.name}`,
        icon: el.props.icon || UI_OVERLAY_KIND_ICONS[el.kind],
      })),
    [displayHud.overlays],
  );

  const nodeListItems = useMemo(
    () =>
      sortItemsByLayerOrder(
        [...HUD_NODE_ITEMS, ...overlayItems],
        layerOrder,
      ),
    [layerOrder, overlayItems],
  );

  const handleReorderNodes = useCallback(
    (orderedIds: readonly string[]): void => {
      onHudChange({
        ...hud,
        layerOrder: [...orderedIds],
        overlays: syncOverlaysZIndexFromLayerOrder(
          hud.overlays ?? [],
          orderedIds,
        ),
      });
    },
    [hud, onHudChange],
  );

  /**
   * 预览强调色：配置优先，空串回退主题 accent。
   */
  const accent =
    typeof layout.accent === "string" && layout.accent.trim().length > 0
      ? layout.accent.trim()
      : tokens.accent;

  /**
   * 槽组包围盒：hit 层与 quickbarRoot 选中框共用。
   */
  const slotsHitRect = useMemo(
    () => slotsBoundingRect(layout.slots),
    [layout.slots],
  );

  /**
   * 单选打开背包按钮即可 resize（absolute 改完整 rect；belowRoot 仅写 w/h）。
   */
  const soleOverlayId =
    selectedNodeIds.length === 1
      ? parseOverlaySelectionId(selectedNodeIds[0]!)
      : null;

  /**
   * 拖拽中写本地草稿（不同步父级 persist）。
   *
   * @param next - 草稿配置
   */
  const applyHudLive = useCallback((next: InventoryHudConfig): void => {
    hudRef.current = next;
    dragDirtyRef.current = true;
    setDragDraft(next);
  }, []);

  /**
   * 开启连续动作（幂等）。
   */
  const ensureActionStarted = useCallback((): void => {
    if (actionOpenRef.current) {
      return;
    }

    actionOpenRef.current = true;
    onActionStartRef.current?.();
  }, []);

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

      if (session.kind === "overlay-drag") {
        const nextPos = applyDrag(session.origin, dx, dy, {
          shiftKey: event.shiftKey,
          snapX: [0, designWidth],
          snapY: [0, designHeight],
        });
        const nextX = Math.max(0, Math.round(nextPos.x));
        const nextY = Math.max(0, Math.round(nextPos.y));
        const overlays = currentHud.overlays ?? [];
        const idx = overlays.findIndex((o) => o.id === session.overlayId);

        if (idx < 0) {
          return;
        }

        const prev = overlays[idx]!;

        if (nextX === prev.rect.x && nextY === prev.rect.y) {
          return;
        }

        const nextOverlays = overlays.slice();
        nextOverlays[idx] = {
          ...prev,
          rect: { ...prev.rect, x: nextX, y: nextY },
        };
        applyHudLive({ ...currentHud, overlays: nextOverlays });

        return;
      }

      if (session.kind === "overlay-resize") {
        const nextRect = applyResize(session.origin, session.handle, dx, dy);
        const rounded: Required<UiRect> = {
          x: Math.max(0, Math.round(nextRect.x)),
          y: Math.max(0, Math.round(nextRect.y)),
          w: Math.max(8, Math.round(nextRect.w)),
          h: Math.max(8, Math.round(nextRect.h)),
        };
        const overlays = currentHud.overlays ?? [];
        const idx = overlays.findIndex((o) => o.id === session.overlayId);

        if (idx < 0) {
          return;
        }

        const prev = overlays[idx]!;

        if (
          prev.rect.x === rounded.x &&
          prev.rect.y === rounded.y &&
          prev.rect.w === rounded.w &&
          prev.rect.h === rounded.h
        ) {
          return;
        }

        const nextOverlays = overlays.slice();
        nextOverlays[idx] = { ...prev, rect: rounded };
        applyHudLive({ ...currentHud, overlays: nextOverlays });

        return;
      }

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

        if (session.nodeId !== "quickbarRoot") {
          return;
        }

        const prev = currentHud.nodes.quickbarRoot.rect;

        if (nextX === prev.x && nextY === prev.y) {
          return;
        }

        applyHudLive({
          ...currentHud,
          nodes: {
            ...currentHud.nodes,
            quickbarRoot: {
              ...currentHud.nodes.quickbarRoot,
              rect: { x: nextX, y: nextY },
            },
          },
        });
      }
    };

    const onPointerUp = (): void => {
      const hadSession = sessionRef.current !== null;

      sessionRef.current = null;

      if (!hadSession) {
        return;
      }

      if (dragDirtyRef.current) {
        dragDirtyRef.current = false;
        onHudChangeRef.current(hudRef.current);
      }

      setDragDraft(null);

      if (actionOpenRef.current) {
        actionOpenRef.current = false;
        onActionEndRef.current?.();
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [applyHudLive, designWidth, designHeight]);

  /**
   * 开始拖拽快捷栏根：选中并记录原点（hit 层与各槽共用）。
   *
   * @param event - 指针事件
   */
  const beginDragQuickbar = useCallback(
    (event: React.PointerEvent): void => {
      event.stopPropagation();
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture?.(
        event.pointerId,
      );
      ensureActionStarted();
      onSelectNode("quickbarRoot", event.shiftKey);
      sessionRef.current = {
        kind: "drag",
        nodeId: "quickbarRoot",
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: layout.root.x, y: layout.root.y },
        scale,
      };
    },
    [ensureActionStarted, layout.root.x, layout.root.y, onSelectNode, scale],
  );

  /**
   * 点击舞台空白：清空选中。
   */
  const onStagePointerDown = useCallback((): void => {
    onSelectNode(null);
  }, [onSelectNode]);

  const slotBoxCss = applyUiBoxStyle(layout.slotStyle);

  return (
    <chakra.div
      data-testid="hud-visual-canvas"
      style={{
        display: "flex",
        flex: 1,
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        background: tokens.bgSunken,
      }}
    >
      <chakra.div
        style={{
          width: 168,
          flexShrink: 0,
          minHeight: 0,
        }}
      >
        <NodeList
          items={nodeListItems}
          selectedIds={selectedNodeIds}
          onSelect={(id, { shiftKey }) => onSelectNode(id, shiftKey)}
          onReorder={handleReorderNodes}
        />
      </chakra.div>

      <chakra.div
        ref={hostRef}
        data-testid="hud-visual-host"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
          background: tokens.bgSunken,
        }}
      >
        {hostSize.w > 0 && hostSize.h > 0 ? (
          <chakra.div
            data-testid="hud-visual-frame"
            style={{
              position: "absolute",
              left: world.offsetX,
              top: world.offsetY,
              width: frameW,
              height: frameH,
              boxShadow: "0 0 0 1px rgba(255,255,255,0.12)",
              overflow: "hidden",
            }}
          >
            <chakra.div
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
              <chakra.div
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
                HUD · 方向键微调 · Shift+10px · Shift+多选 · Esc 取消
              </chakra.div>

              {/*
                槽组透明 hit 层：位于各槽之下，覆盖 slotsBoundingRect，
                点击槽间隙亦可选中 / 拖拽 quickbarRoot。
              */}
              <chakra.div
                data-testid="hud-visual-slots-hit"
                onPointerDown={beginDragQuickbar}
                style={{
                  position: "absolute",
                  left: slotsHitRect.x,
                  top: slotsHitRect.y,
                  width: slotsHitRect.w,
                  height: slotsHitRect.h,
                  zIndex: layerZIndex(layerOrder, "quickbarRoot", 0),
                  cursor: "grab",
                  touchAction: "none",
                  userSelect: "none",
                  background: "transparent",
                  pointerEvents: "auto",
                }}
              />

              {layout.slots.map((slot, index) => (
                <chakra.div
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
                    zIndex: layerZIndex(layerOrder, "quickbarRoot", 0),
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

              <UiOverlayLayer
                overlays={displayHud.overlays ?? []}
                editorMode
                onOverlayPointerDown={(overlayId, event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  (event.currentTarget as HTMLElement).setPointerCapture?.(
                    event.pointerId,
                  );
                  ensureActionStarted();
                  onSelectNode(overlaySelectionId(overlayId), event.shiftKey);
                  const el = (displayHud.overlays ?? []).find(
                    (o) => o.id === overlayId,
                  );

                  if (!el) {
                    return;
                  }

                  sessionRef.current = {
                    kind: "overlay-drag",
                    overlayId,
                    startX: event.clientX,
                    startY: event.clientY,
                    origin: { x: el.rect.x, y: el.rect.y },
                    scale,
                  };
                }}
              />

              {selectedNodeIds.map((nodeId) => {
                const rect = selectionRectFor(nodeId, layout, displayHud);

                if (!rect) {
                  return null;
                }

                const isOverlay = parseOverlaySelectionId(nodeId) !== null;

                return (
                  <SelectionOverlay
                    key={`sel-${nodeId}`}
                    rect={rect}
                    scale={scale}
                    resizable={soleOverlayId !== null && isOverlay}
                    accentColor={accent}
                    onResizeStart={(handle, event) => {
                      if (soleOverlayId === null || !isOverlay) {
                        return;
                      }

                      const el = (displayHud.overlays ?? []).find(
                        (o) => o.id === soleOverlayId,
                      );

                      if (!el) {
                        return;
                      }

                      (event.target as HTMLElement).setPointerCapture?.(
                        event.pointerId,
                      );
                      ensureActionStarted();
                      sessionRef.current = {
                        kind: "overlay-resize",
                        overlayId: soleOverlayId,
                        handle,
                        startX: event.clientX,
                        startY: event.clientY,
                        origin: {
                          x: el.rect.x,
                          y: el.rect.y,
                          w: el.rect.w ?? 24,
                          h: el.rect.h ?? 24,
                        },
                        scale,
                      };
                    }}
                  />
                );
              })}
            </chakra.div>
          </chakra.div>
        ) : null}
      </chakra.div>
    </chakra.div>
  );
}
