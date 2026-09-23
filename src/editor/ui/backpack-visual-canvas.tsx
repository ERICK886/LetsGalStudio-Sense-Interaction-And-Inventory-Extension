import { chakra } from "@chakra-ui/react";
/**
 * backpack-visual-canvas.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.7.0
 *
 * 全屏背包自由布局画布：
 * - 左侧 NodeList：固定节点 + overlays；图层可拖拽排序（调 zIndex）
 * - 设计分辨率 letterbox 舞台上按 resolveBackpackLayout 绝对定位功能节点
 * - chrome（backdrop / panel / title / close / craft 等）已迁为 overlays，由 UiOverlayLayer 预览
 * - itemGrid / detailPanel：拖拽改 x/y，单选时可 resize
 * - overlays：自由图层选中 / 拖拽 / resize
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveBackpackLayout,
  type ResolvedBackpackLayout,
} from "../../domain/backpack-layout";
import { applyUiBoxStyle, applyUiTextStyle } from "../../domain/ui-style";
import type {
  BackpackNodeId,
  BackpackScreenConfig,
  UiRect,
} from "../../domain/types";
import { buildDefaultBackpackLayerOrder } from "../../domain/backpack-screen-config";
import {
  layerZIndex,
  sortItemsByLayerOrder,
  syncOverlaysZIndexFromLayerOrder,
} from "../../domain/layer-order";
import {
  overlaySelectionId,
  parseOverlaySelectionId,
  UI_OVERLAY_KIND_ICONS,
  UI_OVERLAY_KIND_LABELS,
} from "../../domain/ui-overlay";
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

/** 背包画布侧栏固定功能节点（chrome 已迁为 overlays 组件） */
const BAG_NODE_ITEMS: readonly NodeListItem[] = [
  { id: "itemGrid", label: "物品网格", icon: "table-cells" },
  { id: "detailPanel", label: "详情面板", icon: "rectangle-list" },
];

/** 可拖拽 / resize 的功能节点 */
const DRAGGABLE_RECT_NODES: readonly BackpackNodeId[] = [
  "itemGrid",
  "detailPanel",
];

/**
 * BackpackVisualCanvas 属性。
 */
export interface BackpackVisualCanvasProps {
  /** 设计宽（舞台像素） */
  designWidth: number;

  /** 设计高（舞台像素） */
  designHeight: number;

  /** 当前全屏背包配置 */
  config: BackpackScreenConfig;

  /**
   * 当前选中 id 列表（多选）；角色节点或 `overlay:<id>`。
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
   * 拖拽 / resize 变化时回写完整背包配置。
   *
   * @param next - 新配置
   */
  onConfigChange: (next: BackpackScreenConfig) => void;

  /**
   * 连续动作开始（pointerdown）：撤销栈记录动作前状态为当前栈顶。
   */
  onActionStart?: () => void;

  /**
   * 连续动作结束（pointerup）：与 onConfigChange 配合，整段拖拽只占一步撤销。
   */
  onActionEnd?: () => void;
}

/**
 * 指针会话：拖拽 / resize 功能节点 rect，或 overlay 拖拽 / resize。
 */
type PointerSession =
  | {
      kind: "drag";
      nodeId: BackpackNodeId;
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
      kind: "resize";
      nodeId: BackpackNodeId;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      origin: Required<UiRect>;
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
 * 判断节点是否为可拖拽的 rect 节点。
 *
 * @param id - 节点 id
 * @returns 是否可拖拽 / resize
 */
function isDraggableRectNode(id: BackpackNodeId): boolean {
  return (DRAGGABLE_RECT_NODES as readonly string[]).includes(id);
}

/**
 * 从解析布局读取某 rect 节点的几何。
 *
 * @param layout - resolveBackpackLayout 结果
 * @param nodeId - 带 rect 的节点
 * @returns Required rect；非法 id 时返回 null
 */
function layoutRectFor(
  layout: ResolvedBackpackLayout,
  nodeId: BackpackNodeId,
): Required<UiRect> | null {
  switch (nodeId) {
    case "itemGrid":
      return layout.itemGrid.rect;
    case "detailPanel":
      return layout.detailPanel.rect;
    default:
      return null;
  }
}

/**
 * 为拖拽构造边缘吸附目标（设计边界 + 其它节点边）。
 *
 * @param nodeId - 正在拖拽的节点
 * @param layout - 当前解析布局
 * @param designWidth - 设计宽
 * @param designHeight - 设计高
 * @returns snapX / snapY 目标列表
 */
function snapTargetsFor(
  nodeId: BackpackNodeId,
  layout: ResolvedBackpackLayout,
  designWidth: number,
  designHeight: number,
): { snapX: number[]; snapY: number[] } {
  const snapX = [0, designWidth];
  const snapY = [0, designHeight];

  for (const id of DRAGGABLE_RECT_NODES) {
    if (id === nodeId) {
      continue;
    }

    const rect = layoutRectFor(layout, id);

    if (!rect) {
      continue;
    }

    snapX.push(rect.x, rect.x + rect.w);
    snapY.push(rect.y, rect.y + rect.h);
  }

  return { snapX, snapY };
}

/**
 * 将节点 rect 写回配置（保留该节点其它字段）。
 *
 * @param config - 当前配置
 * @param nodeId - 带 rect 的节点
 * @param rect - 新矩形
 * @returns 新配置；若 nodeId 不可写 rect 则返回原配置
 */
function patchNodeRect(
  config: BackpackScreenConfig,
  nodeId: BackpackNodeId,
  rect: Required<UiRect>,
): BackpackScreenConfig {
  const rounded: Required<UiRect> = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
  };

  switch (nodeId) {
    case "itemGrid":
      return {
        ...config,
        nodes: {
          ...config.nodes,
          itemGrid: { ...config.nodes.itemGrid, rect: rounded },
        },
      };
    case "detailPanel":
      return {
        ...config,
        nodes: {
          ...config.nodes,
          detailPanel: { ...config.nodes.detailPanel, rect: rounded },
        },
      };
    default:
      return config;
  }
}

/**
 * 读取配置中某节点当前 rect（缺省时用 layout 补齐）。
 *
 * @param config - 配置
 * @param layout - 解析布局
 * @param nodeId - 节点
 * @returns Required rect 或 null
 */
function configRectFor(
  config: BackpackScreenConfig,
  layout: ResolvedBackpackLayout,
  nodeId: BackpackNodeId,
): Required<UiRect> | null {
  const resolved = layoutRectFor(layout, nodeId);

  if (!resolved) {
    return null;
  }

  let raw: UiRect | undefined;

  switch (nodeId) {
    case "itemGrid":
      raw = config.nodes.itemGrid.rect;
      break;
    case "detailPanel":
      raw = config.nodes.detailPanel.rect;
      break;
    default:
      return null;
  }

  return {
    x: typeof raw.x === "number" ? raw.x : resolved.x,
    y: typeof raw.y === "number" ? raw.y : resolved.y,
    w:
      typeof raw.w === "number" && raw.w > 0
        ? raw.w
        : resolved.w,
    h:
      typeof raw.h === "number" && raw.h > 0
        ? raw.h
        : resolved.h,
  };
}

/**
 * 全屏背包自由布局可视化编辑画布。
 *
 * @param props - BackpackVisualCanvasProps
 * @returns 左侧节点列表 + letterbox 舞台
 *
 * @example
 * ```tsx
 * <BackpackVisualCanvas
 *   designWidth={1920}
 *   designHeight={1080}
 *   config={bag}
 *   selectedNodeIds={["itemGrid"]}
 *   onSelectNode={(id, shiftKey) => ...}
 *   onConfigChange={persistBag}
 * />
 * ```
 *
 * @throws 无（非法尺寸由 fitDesignToHost / resolveBackpackLayout 侧钳制）
 */
export function BackpackVisualCanvas({
  designWidth,
  designHeight,
  config,
  selectedNodeIds,
  onSelectNode,
  onConfigChange,
  onActionStart,
  onActionEnd,
}: BackpackVisualCanvasProps): React.ReactElement {
  const { tokens } = useTheme();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
  /**
   * 拖拽 / resize 期间的本地草稿：避免每帧 persist（history 深拷贝 + settings）
   * 导致元件跟不上指针。
   */
  const [dragDraft, setDragDraft] = useState<BackpackScreenConfig | null>(null);
  const sessionRef = useRef<PointerSession | null>(null);
  const dragDirtyRef = useRef(false);
  const actionOpenRef = useRef(false);

  /** 指针会话中读取最新配置，避免闭包过期 */
  const configRef = useRef(config);
  const layoutRef = useRef<ResolvedBackpackLayout | null>(null);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const onConfigChangeRef = useRef(onConfigChange);
  const onActionStartRef = useRef(onActionStart);
  const onActionEndRef = useRef(onActionEnd);

  onConfigChangeRef.current = onConfigChange;
  onActionStartRef.current = onActionStart;
  onActionEndRef.current = onActionEnd;
  selectedNodeIdsRef.current = selectedNodeIds;

  const displayConfig = dragDraft ?? config;

  configRef.current = displayConfig;

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

      const layout = layoutRef.current;

      if (!layout) {
        return;
      }

      event.preventDefault();

      let next = configRef.current;
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

        if (!isDraggableRectNode(nodeId as BackpackNodeId)) {
          continue;
        }

        const rect = configRectFor(next, layout, nodeId as BackpackNodeId);

        if (!rect) {
          continue;
        }

        const origin = nudgeOrigin(rect, delta.dx, delta.dy);

        if (origin.x === rect.x && origin.y === rect.y) {
          continue;
        }

        const patched = patchNodeRect(next, nodeId as BackpackNodeId, {
          ...rect,
          x: origin.x,
          y: origin.y,
        });

        if (patched !== next) {
          next = patched;
          changed = true;
        }
      }

      if (changed) {
        onConfigChangeRef.current(next);
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
   * 共享布局：与运行时 resolveBackpackLayout 一致（含拖拽草稿）。
   */
  const layout = useMemo(
    () => resolveBackpackLayout(displayConfig),
    [displayConfig],
  );

  layoutRef.current = layout;

  /**
   * 预览强调色：配置优先，空串回退主题 accent。
   */
  const accent =
    typeof layout.accent === "string" && layout.accent.trim().length > 0
      ? layout.accent.trim()
      : tokens.accent;

  const layerOrder = useMemo(
    () =>
      displayConfig.layerOrder ??
      buildDefaultBackpackLayerOrder(displayConfig.overlays),
    [displayConfig.layerOrder, displayConfig.overlays],
  );

  const overlayItems: NodeListItem[] = useMemo(
    () =>
      (displayConfig.overlays ?? []).map((el) => ({
        id: overlaySelectionId(el.id),
        label: `${UI_OVERLAY_KIND_LABELS[el.kind]} · ${el.name}`,
        icon: el.props.icon || UI_OVERLAY_KIND_ICONS[el.kind],
      })),
    [displayConfig.overlays],
  );

  const nodeListItems = useMemo(
    () =>
      sortItemsByLayerOrder(
        [...BAG_NODE_ITEMS, ...overlayItems],
        layerOrder,
      ),
    [layerOrder, overlayItems],
  );

  const handleReorderNodes = useCallback(
    (orderedIds: readonly string[]): void => {
      onConfigChange({
        ...config,
        layerOrder: [...orderedIds],
        overlays: syncOverlaysZIndexFromLayerOrder(
          config.overlays ?? [],
          orderedIds,
        ),
      });
    },
    [config, onConfigChange],
  );

  /**
   * 解析某背包节点 / 图层的选中叠层矩形。
   *
   * @param nodeId - 节点 id 或 `overlay:<id>`
   * @returns 设计像素矩形；未知 id 时返回 null
   */
  const selectionRectFor = useCallback(
    (nodeId: string): Required<UiRect> | null => {
      const overlayId = parseOverlaySelectionId(nodeId);

      if (overlayId !== null) {
        const el = (displayConfig.overlays ?? []).find(
          (o) => o.id === overlayId,
        );

        return el ? { ...el.rect } : null;
      }

      return layoutRectFor(layout, nodeId as BackpackNodeId);
    },
    [displayConfig.overlays, layout],
  );

  /**
   * 单选且可 resize：itemGrid / detailPanel。
   */
  const soleResizableId =
    selectedNodeIds.length === 1 &&
    isDraggableRectNode(selectedNodeIds[0] as BackpackNodeId)
      ? (selectedNodeIds[0] as BackpackNodeId)
      : null;

  const soleOverlayId =
    selectedNodeIds.length === 1
      ? parseOverlaySelectionId(selectedNodeIds[0]!)
      : null;

  /**
   * 拖拽中写本地草稿（不同步父级 persist）。
   *
   * @param next - 草稿配置
   */
  const applyConfigLive = useCallback((next: BackpackScreenConfig): void => {
    configRef.current = next;
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
   * 窗口级 pointermove / pointerup：会话期间应用 applyDrag / applyResize。
   */
  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      const session = sessionRef.current;
      const currentLayout = layoutRef.current;

      if (!session || !currentLayout) {
        return;
      }

      const currentConfig = configRef.current;

      const dx = (event.clientX - session.startX) / session.scale;
      const dy = (event.clientY - session.startY) / session.scale;

      if (session.kind === "overlay-drag") {
        const nextPos = applyDrag(session.origin, dx, dy, {
          shiftKey: event.shiftKey,
          snapX: [0, designWidth],
          snapY: [0, designHeight],
        });
        const nextX = Math.max(0, Math.round(nextPos.x));
        const nextY = Math.max(0, Math.round(nextPos.y));
        const overlays = currentConfig.overlays ?? [];
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
        applyConfigLive({ ...currentConfig, overlays: nextOverlays });

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
        const overlays = currentConfig.overlays ?? [];
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
        applyConfigLive({ ...currentConfig, overlays: nextOverlays });

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
        const prev = configRectFor(
          currentConfig,
          currentLayout,
          session.nodeId,
        );

        if (!prev) {
          return;
        }

        const nextX = Math.max(0, Math.round(nextPos.x));
        const nextY = Math.max(0, Math.round(nextPos.y));

        if (nextX === prev.x && nextY === prev.y) {
          return;
        }

        applyConfigLive(
          patchNodeRect(currentConfig, session.nodeId, {
            x: nextX,
            y: nextY,
            w: prev.w,
            h: prev.h,
          }),
        );

        return;
      }

      if (session.kind !== "resize") {
        return;
      }

      const nextRect = applyResize(session.origin, session.handle, dx, dy);
      const rounded: Required<UiRect> = {
        x: Math.round(nextRect.x),
        y: Math.round(nextRect.y),
        w: Math.round(nextRect.w),
        h: Math.round(nextRect.h),
      };

      const prev = configRectFor(
        currentConfig,
        currentLayout,
        session.nodeId,
      );

      if (
        prev &&
        prev.x === rounded.x &&
        prev.y === rounded.y &&
        prev.w === rounded.w &&
        prev.h === rounded.h
      ) {
        return;
      }

      applyConfigLive(patchNodeRect(currentConfig, session.nodeId, rounded));
    };

    const onPointerUp = (): void => {
      const hadSession = sessionRef.current !== null;

      sessionRef.current = null;

      if (!hadSession) {
        return;
      }

      if (dragDirtyRef.current) {
        dragDirtyRef.current = false;
        onConfigChangeRef.current(configRef.current);
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
  }, [applyConfigLive, designWidth, designHeight]);

  /**
   * 开始拖拽带 rect 的节点。
   *
   * @param nodeId - 节点 id
   * @param event - 指针事件
   */
  const beginDragRect = useCallback(
    (nodeId: BackpackNodeId, event: React.PointerEvent): void => {
      event.stopPropagation();
      event.preventDefault();

      const rect = layoutRectFor(layout, nodeId);

      if (!rect) {
        return;
      }

      (event.currentTarget as HTMLElement).setPointerCapture?.(
        event.pointerId,
      );
      ensureActionStarted();
      onSelectNode(nodeId, event.shiftKey);
      sessionRef.current = {
        kind: "drag",
        nodeId,
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: rect.x, y: rect.y },
        scale,
      };
    },
    [ensureActionStarted, layout, onSelectNode, scale],
  );

  /**
   * SelectionOverlay 手柄按下：开启 resize 会话（仅单选可 resize 节点）。
   *
   * @param handle - 八向手柄
   * @param event - 指针事件
   */
  const onResizeStart = useCallback(
    (handle: ResizeHandle, event: React.PointerEvent<HTMLDivElement>): void => {
      if (!soleResizableId) {
        return;
      }

      const rect = layoutRectFor(layout, soleResizableId);

      if (!rect) {
        return;
      }

      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      ensureActionStarted();

      sessionRef.current = {
        kind: "resize",
        nodeId: soleResizableId,
        handle,
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
        scale,
      };
    },
    [ensureActionStarted, layout, scale, soleResizableId],
  );

  /**
   * 点击舞台空白：清空选中。
   */
  const onStagePointerDown = useCallback((): void => {
    onSelectNode(null);
  }, [onSelectNode]);

  const gridCss = applyUiBoxStyle(layout.itemGrid.style);
  const gridCellCss = applyUiBoxStyle(layout.itemGrid.cellStyle);
  const gridSelectedCss = applyUiBoxStyle(layout.itemGrid.selectedStyle);
  const gridCellLabelCss = applyUiTextStyle(layout.itemGrid.cellLabelStyle);
  const detailCss = applyUiBoxStyle(layout.detailPanel.style);
  const detailHeroCss = applyUiBoxStyle(layout.detailPanel.heroStyle);
  const detailTitleCss = applyUiTextStyle(layout.detailPanel.titleStyle);
  const detailMetaCss = applyUiTextStyle(layout.detailPanel.metaStyle);
  const detailDescriptionCss = applyUiTextStyle(
    layout.detailPanel.descriptionStyle,
  );
  const detailIngredientsLabelCss = applyUiTextStyle(
    layout.detailPanel.ingredientsLabelStyle,
  );
  const detailIngredientsCss = applyUiTextStyle(
    layout.detailPanel.ingredientsStyle,
  );
  const ingredientsHeading =
    layout.detailPanel.ingredientsLabelStyle.label?.trim() || "原料";
  const iconMaxSize = Math.max(24, layout.itemGrid.iconMaxSize);

  const grid = layout.itemGrid.rect;
  const detail = layout.detailPanel.rect;
  const gridCellMin = layout.itemGrid.cellMin;
  const heroHeight = layout.detailPanel.heroHeight;
  const detailPad = layout.detailPanel.padding;

  return (
    <chakra.div
      data-testid="backpack-visual-canvas"
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
        data-testid="backpack-visual-host"
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
            data-testid="backpack-visual-frame"
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
              data-testid="backpack-visual-stage"
              onPointerDown={onStagePointerDown}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: designWidth,
                height: designHeight,
                transform: `scale(${scale})`,
                transformOrigin: "0 0",
                background: "#05080c",
                color: "#f2f5f7",
                fontFamily:
                  '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
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
                  zIndex: 9999,
                }}
              >
                背包 · 方向键微调 · Shift+10px · Shift+多选 · Esc 取消
              </chakra.div>
              <UiOverlayLayer
                overlays={displayConfig.overlays ?? []}
                editorMode
                onOverlayPointerDown={(overlayId, event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  (event.currentTarget as HTMLElement).setPointerCapture?.(
                    event.pointerId,
                  );
                  ensureActionStarted();
                  onSelectNode(overlaySelectionId(overlayId), event.shiftKey);
                  const el = (displayConfig.overlays ?? []).find(
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

              {/* itemGrid */}
              <chakra.div
                data-testid="backpack-visual-grid"
                onPointerDown={(event) => beginDragRect("itemGrid", event)}
                style={{
                  position: "absolute",
                  left: grid.x,
                  top: grid.y,
                  width: grid.w,
                  height: grid.h,
                  zIndex: layerZIndex(layerOrder, "itemGrid", 10),
                  boxSizing: "border-box",
                  padding: 16,
                  display: "grid",
                  gridTemplateColumns: `repeat(auto-fill, minmax(${gridCellMin}px, 1fr))`,
                  gap: 12,
                  alignContent: "start",
                  background: "rgba(10, 14, 20, 0.55)",
                  borderRight: "1px solid rgba(255,255,255,0.08)",
                  cursor: "grab",
                  touchAction: "none",
                  userSelect: "none",
                  overflow: "hidden",
                  ...gridCss,
                }}
              >
                {Array.from({ length: 8 }, (_, i) => {
                  const selected = i === 0;
                  const cellBox = selected
                    ? layout.itemGrid.selectedStyle
                    : layout.itemGrid.cellStyle;
                  const borderColor =
                    cellBox.borderColor?.trim() ||
                    (selected ? accent : "rgba(255,255,255,0.08)");
                  const background =
                    cellBox.background?.trim() ||
                    (selected ? `${accent}22` : "rgba(255,255,255,0.03)");

                  return (
                    <chakra.div
                      key={`cell-${i}`}
                      style={{
                        aspectRatio: "1 / 1",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "stretch",
                        justifyContent: "flex-end",
                        padding: 10,
                        borderRadius: cellBox.borderRadius ?? 12,
                        border: `${cellBox.borderWidth ?? 1}px solid ${borderColor}`,
                        background,
                        pointerEvents: "none",
                        overflow: "hidden",
                        ...(selected ? gridSelectedCss : gridCellCss),
                      }}
                    >
                      <chakra.div
                        style={{
                          flex: 1,
                          minHeight: 0,
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <chakra.span
                          aria-hidden
                          style={{
                            width: iconMaxSize,
                            height: iconMaxSize,
                            borderRadius: "50%",
                            background:
                              "radial-gradient(circle at 35% 30%, #e8e0d0 0%, #6a7a88 100%)",
                            opacity: 0.7,
                            flexShrink: 0,
                          }}
                        />
                      </chakra.div>
                      <chakra.div
                        style={{
                          lineHeight: 1.25,
                          textAlign: "center",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          ...gridCellLabelCss,
                        }}
                      >
                        {selected ? "物品" : ""}
                      </chakra.div>
                    </chakra.div>
                  );
                })}
              </chakra.div>

              {/* detailPanel */}
              <chakra.div
                data-testid="backpack-visual-detail"
                onPointerDown={(event) => beginDragRect("detailPanel", event)}
                style={{
                  position: "absolute",
                  left: detail.x,
                  top: detail.y,
                  width: detail.w,
                  height: detail.h,
                  zIndex: layerZIndex(layerOrder, "detailPanel", 10),
                  boxSizing: "border-box",
                  padding: detailPad,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  cursor: "grab",
                  touchAction: "none",
                  userSelect: "none",
                  overflow: "hidden",
                  ...detailCss,
                }}
              >
                <chakra.div
                  style={{
                    height: heroHeight,
                    maxHeight: "34%",
                    pointerEvents: "none",
                    flexShrink: 0,
                    ...detailHeroCss,
                  }}
                />
                <chakra.div
                  style={{
                    pointerEvents: "none",
                    ...detailTitleCss,
                  }}
                >
                  物品名称
                </chakra.div>
                <chakra.div
                  style={{
                    pointerEvents: "none",
                    ...detailMetaCss,
                  }}
                >
                  持有 ×1
                </chakra.div>
                <chakra.div
                  style={{
                    pointerEvents: "none",
                    ...detailDescriptionCss,
                  }}
                >
                  详情预览区
                </chakra.div>
                <chakra.div
                  style={{
                    pointerEvents: "none",
                    lineHeight: 1.6,
                    ...detailIngredientsCss,
                  }}
                >
                  <chakra.div
                    style={{
                      marginBottom: 4,
                      ...detailIngredientsLabelCss,
                    }}
                  >
                    {ingredientsHeading}
                  </chakra.div>
                  原料预览 ×1
                </chakra.div>
              </chakra.div>

              {selectedNodeIds.map((nodeId) => {
                const rect = selectionRectFor(nodeId);

                if (!rect) {
                  return null;
                }

                const isOverlay = parseOverlaySelectionId(nodeId) !== null;

                return (
                  <SelectionOverlay
                    key={`sel-${nodeId}`}
                    rect={rect}
                    scale={scale}
                    resizable={
                      soleResizableId === nodeId ||
                      (soleOverlayId !== null && isOverlay)
                    }
                    accentColor={accent}
                    onResizeStart={(handle, event) => {
                      if (soleOverlayId !== null && isOverlay) {
                        const el = (displayConfig.overlays ?? []).find(
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
                          origin: { ...el.rect },
                          scale,
                        };

                        return;
                      }

                      onResizeStart(handle, event);
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
