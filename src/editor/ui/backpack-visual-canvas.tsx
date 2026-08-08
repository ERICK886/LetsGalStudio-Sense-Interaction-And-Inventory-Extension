/**
 * backpack-visual-canvas.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.5.0
 *
 * 全屏背包自由布局画布：
 * - 左侧 NodeList 选节点
 * - 设计分辨率 letterbox 舞台上按 resolveBackpackLayout 绝对定位各节点
 * - backdrop 可选中但禁止拖拽 / resize
 * - 其余带 rect 的节点：拖拽改 x/y，有 w/h 可 resize
 * - craftButton：预览块锚定 detailPanel 底边 + offsetY，竖直拖拽改 offsetY
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveBackpackLayout,
  type ResolvedBackpackLayout,
} from "../../domain/backpack-layout";
import {
  applyUiBoxStyle,
  applyUiTextStyle,
} from "../../domain/ui-style";
import type {
  BackpackNodeId,
  BackpackScreenConfig,
  UiRect,
} from "../../domain/types";
import { fitDesignToHost } from "../../shared/scene-layout";
import { useTheme } from "../../theme/theme-provider";
import {
  applyDrag,
  applyResize,
  type ResizeHandle,
} from "./free-layout-selection";
import { NodeList, type NodeListItem } from "./node-list";
import { SelectionOverlay } from "./selection-overlay";

/** 背包画布侧栏固定节点条目 */
const BAG_NODE_ITEMS: readonly NodeListItem[] = [
  { id: "backdrop", label: "遮罩" },
  { id: "panelChrome", label: "主面板" },
  { id: "titleBlock", label: "标题区" },
  { id: "closeButton", label: "关闭按钮" },
  { id: "itemGrid", label: "物品网格" },
  { id: "detailPanel", label: "详情面板" },
  { id: "craftButton", label: "合成按钮" },
];

/** 可拖拽 / resize 的带舞台 rect 节点（不含 backdrop / craftButton） */
const DRAGGABLE_RECT_NODES: readonly BackpackNodeId[] = [
  "panelChrome",
  "titleBlock",
  "closeButton",
  "itemGrid",
  "detailPanel",
];

/** 合成按钮预览默认高度（设计像素） */
const CRAFT_PREVIEW_H = 44;

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

  /** 当前选中节点；无选中时为 null */
  selectedNodeId: BackpackNodeId | null;

  /**
   * 选中节点变化。
   *
   * @param id - 节点 id，或 null 表示清空选中
   */
  onSelectNode: (id: BackpackNodeId | null) => void;

  /**
   * 拖拽 / resize / offsetY 变化时回写完整背包配置。
   *
   * @param next - 新配置
   */
  onConfigChange: (next: BackpackScreenConfig) => void;
}

/**
 * 指针会话：拖拽节点 rect、竖直改 craftButton.offsetY、或八向 resize。
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
      kind: "craft-offset";
      startY: number;
      originOffsetY: number;
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
 * @param nodeId - 带 rect 的节点（不含 backdrop / craftButton）
 * @returns Required rect；非法 id 时返回 null
 */
function layoutRectFor(
  layout: ResolvedBackpackLayout,
  nodeId: BackpackNodeId,
): Required<UiRect> | null {
  switch (nodeId) {
    case "panelChrome":
      return layout.panelChrome.rect;
    case "titleBlock":
      return layout.titleBlock.rect;
    case "closeButton":
      return layout.closeButton.rect;
    case "itemGrid":
      return layout.itemGrid.rect;
    case "detailPanel":
      return layout.detailPanel.rect;
    default:
      return null;
  }
}

/**
 * 合成按钮预览矩形：贴在 detailPanel 底边内侧，再叠加 offsetY。
 *
 * y = detail.y + detail.h - pad - height + offsetY
 * （offsetY>0 下移，<0 上移；与 schema「相对详情底边额外 Y 偏移」一致）
 *
 * @param layout - 解析布局
 * @returns 设计像素预览框
 *
 * @example
 * ```ts
 * const r = craftPreviewRect(layout);
 * // r.w ≈ detail.w - 2*padding
 * ```
 */
function craftPreviewRect(layout: ResolvedBackpackLayout): Required<UiRect> {
  const detail = layout.detailPanel.rect;
  const pad = Math.max(8, layout.detailPanel.padding);
  const w = Math.max(48, detail.w - pad * 2);
  const h = CRAFT_PREVIEW_H;
  const x = detail.x + pad;
  const y = detail.y + detail.h - pad - h + layout.craftButton.offsetY;

  return { x, y, w, h };
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
    case "panelChrome":
      return {
        ...config,
        nodes: {
          ...config.nodes,
          panelChrome: { ...config.nodes.panelChrome, rect: rounded },
        },
      };
    case "titleBlock":
      return {
        ...config,
        nodes: {
          ...config.nodes,
          titleBlock: { ...config.nodes.titleBlock, rect: rounded },
        },
      };
    case "closeButton":
      return {
        ...config,
        nodes: {
          ...config.nodes,
          closeButton: { ...config.nodes.closeButton, rect: rounded },
        },
      };
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
    case "panelChrome":
      raw = config.nodes.panelChrome.rect;
      break;
    case "titleBlock":
      raw = config.nodes.titleBlock.rect;
      break;
    case "closeButton":
      raw = config.nodes.closeButton.rect;
      break;
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
 *   selectedNodeId={selected}
 *   onSelectNode={setSelected}
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
  selectedNodeId,
  onSelectNode,
  onConfigChange,
}: BackpackVisualCanvasProps): React.ReactElement {
  const { tokens } = useTheme();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
  const sessionRef = useRef<PointerSession | null>(null);

  /** 指针会话中读取最新配置，避免闭包过期 */
  const configRef = useRef(config);
  const layoutRef = useRef<ResolvedBackpackLayout | null>(null);

  configRef.current = config;

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
   * 共享布局：与运行时 resolveBackpackLayout 一致。
   */
  const layout = useMemo(() => resolveBackpackLayout(config), [config]);

  layoutRef.current = layout;

  /**
   * 预览强调色：配置优先，空串回退主题 accent。
   */
  const accent =
    typeof layout.accent === "string" && layout.accent.trim().length > 0
      ? layout.accent.trim()
      : tokens.accent;

  const craftRect = useMemo(() => craftPreviewRect(layout), [layout]);

  /**
   * 选中叠层矩形。
   */
  const selectionRect = useMemo((): Required<UiRect> | null => {
    if (!selectedNodeId) {
      return null;
    }

    if (selectedNodeId === "backdrop") {
      return { x: 0, y: 0, w: designWidth, h: designHeight };
    }

    if (selectedNodeId === "craftButton") {
      return craftRect;
    }

    return layoutRectFor(layout, selectedNodeId);
  }, [selectedNodeId, layout, craftRect, designWidth, designHeight]);

  const selectionResizable =
    selectedNodeId !== null && isDraggableRectNode(selectedNodeId);

  /**
   * 窗口级 pointermove / pointerup：会话期间应用 applyDrag / applyResize / offsetY。
   */
  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      const session = sessionRef.current;
      const currentLayout = layoutRef.current;

      if (!session || !currentLayout) {
        return;
      }

      const currentConfig = configRef.current;

      if (session.kind === "craft-offset") {
        const dy = (event.clientY - session.startY) / session.scale;
        const nextOffsetY = Math.round(session.originOffsetY + dy);
        const prev = currentConfig.nodes.craftButton.offsetY ?? 0;

        if (nextOffsetY === prev) {
          return;
        }

        onConfigChange({
          ...currentConfig,
          nodes: {
            ...currentConfig.nodes,
            craftButton: {
              ...currentConfig.nodes.craftButton,
              offsetY: nextOffsetY,
            },
          },
        });

        return;
      }

      const dx = (event.clientX - session.startX) / session.scale;
      const dy = (event.clientY - session.startY) / session.scale;

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

        onConfigChange(
          patchNodeRect(currentConfig, session.nodeId, {
            x: nextX,
            y: nextY,
            w: prev.w,
            h: prev.h,
          }),
        );

        return;
      }

      // resize
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

      onConfigChange(patchNodeRect(currentConfig, session.nodeId, rounded));
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
  }, [designWidth, designHeight, onConfigChange]);

  /**
   * 选中 backdrop（不开启拖拽会话）。
   *
   * @param event - 指针事件
   */
  const onBackdropPointerDown = useCallback(
    (event: React.PointerEvent): void => {
      event.stopPropagation();
      onSelectNode("backdrop");
    },
    [onSelectNode],
  );

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

      onSelectNode(nodeId);
      sessionRef.current = {
        kind: "drag",
        nodeId,
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: rect.x, y: rect.y },
        scale,
      };
    },
    [layout, onSelectNode, scale],
  );

  /**
   * 开始竖直拖拽合成按钮（改 offsetY）。
   *
   * @param event - 指针事件
   */
  const beginDragCraftOffset = useCallback(
    (event: React.PointerEvent): void => {
      event.stopPropagation();
      event.preventDefault();
      onSelectNode("craftButton");
      sessionRef.current = {
        kind: "craft-offset",
        startY: event.clientY,
        originOffsetY: layout.craftButton.offsetY,
        scale,
      };
    },
    [layout.craftButton.offsetY, onSelectNode, scale],
  );

  /**
   * SelectionOverlay 手柄按下：开启 resize 会话。
   *
   * @param handle - 八向手柄
   * @param event - 指针事件
   */
  const onResizeStart = useCallback(
    (handle: ResizeHandle, event: React.PointerEvent<HTMLDivElement>): void => {
      if (!selectedNodeId || !isDraggableRectNode(selectedNodeId)) {
        return;
      }

      const rect = layoutRectFor(layout, selectedNodeId);

      if (!rect) {
        return;
      }

      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);

      sessionRef.current = {
        kind: "resize",
        nodeId: selectedNodeId,
        handle,
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
        scale,
      };
    },
    [layout, scale, selectedNodeId],
  );

  /**
   * 侧栏选中（NodeList 回调 id 为 string）。
   *
   * @param id - 节点 id
   */
  const onNodeListSelect = useCallback(
    (id: string): void => {
      const known = BAG_NODE_ITEMS.some((item) => item.id === id);

      if (known) {
        onSelectNode(id as BackpackNodeId);
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

  const backdropCss = applyUiBoxStyle(layout.backdrop.style);
  const panelCss = applyUiBoxStyle(layout.panelChrome.style);
  const gridCss = applyUiBoxStyle(layout.itemGrid.style);
  const detailCss = applyUiBoxStyle(layout.detailPanel.style);
  const closeBoxCss = applyUiBoxStyle(layout.closeButton.style);
  const closeTextCss = applyUiTextStyle(layout.closeButton.style);
  const craftBoxCss = applyUiBoxStyle(layout.craftButton.style);
  const craftTextCss = applyUiTextStyle(layout.craftButton.style);
  const eyebrowCss = applyUiTextStyle(layout.titleBlock.eyebrow);
  const titleCss = applyUiTextStyle(layout.titleBlock.title);
  const modeLinkCss = applyUiTextStyle(layout.titleBlock.modeLink);

  const titleEyebrow =
    layout.titleBlock.eyebrow.label?.trim() || "INVENTORY";
  const titleLabel = layout.titleBlock.title.label?.trim() || "道具";
  const modeLinkLabel =
    layout.titleBlock.modeLink.label?.trim() || "打开合成";
  const closeLabel = layout.closeButton.style.label?.trim() || "×";
  const craftLabel = layout.craftButton.style.label?.trim() || "合成";

  const panel = layout.panelChrome.rect;
  const title = layout.titleBlock.rect;
  const close = layout.closeButton.rect;
  const grid = layout.itemGrid.rect;
  const detail = layout.detailPanel.rect;
  const gridCellMin = layout.itemGrid.cellMin;
  const heroHeight = layout.detailPanel.heroHeight;
  const detailPad = layout.detailPanel.padding;

  return (
    <div
      data-testid="backpack-visual-canvas"
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
          items={BAG_NODE_ITEMS}
          selectedId={selectedNodeId}
          onSelect={onNodeListSelect}
        />
      </div>

      <div
        ref={hostRef}
        data-testid="backpack-visual-host"
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
              {/* backdrop：可选中，忽略 drag/resize */}
              <div
                data-testid="backpack-visual-backdrop"
                onPointerDown={onBackdropPointerDown}
                style={{
                  position: "absolute",
                  inset: 0,
                  cursor: "pointer",
                  touchAction: "none",
                  userSelect: "none",
                  background: "rgba(0, 0, 0, 0.55)",
                  ...backdropCss,
                }}
              />

              {/* panelChrome */}
              <div
                data-testid="backpack-visual-panel"
                onPointerDown={(event) => beginDragRect("panelChrome", event)}
                style={{
                  position: "absolute",
                  left: panel.x,
                  top: panel.y,
                  width: panel.w,
                  height: panel.h,
                  boxSizing: "border-box",
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(14, 18, 24, 0.92)",
                  cursor: "grab",
                  touchAction: "none",
                  userSelect: "none",
                  overflow: "hidden",
                  ...panelCss,
                }}
              />

              {/* titleBlock */}
              <div
                data-testid="backpack-visual-title"
                onPointerDown={(event) => beginDragRect("titleBlock", event)}
                style={{
                  position: "absolute",
                  left: title.x,
                  top: title.y,
                  width: title.w,
                  height: title.h,
                  boxSizing: "border-box",
                  cursor: "grab",
                  touchAction: "none",
                  userSelect: "none",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 4,
                  pointerEvents: "auto",
                }}
              >
                <div
                  style={{
                    color: accent,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.22em",
                    ...eyebrowCss,
                  }}
                >
                  {titleEyebrow}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 750,
                    letterSpacing: "0.04em",
                    ...titleCss,
                  }}
                >
                  {titleLabel}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 13,
                    color: "rgba(220,230,235,0.65)",
                    ...modeLinkCss,
                  }}
                >
                  {modeLinkLabel}
                </div>
              </div>

              {/* closeButton */}
              <div
                data-testid="backpack-visual-close"
                onPointerDown={(event) => beginDragRect("closeButton", event)}
                style={{
                  position: "absolute",
                  left: close.x,
                  top: close.y,
                  width: close.w,
                  height: close.h,
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  cursor: "grab",
                  touchAction: "none",
                  userSelect: "none",
                  ...closeBoxCss,
                  ...closeTextCss,
                }}
              >
                {closeLabel}
              </div>

              {/* itemGrid */}
              <div
                data-testid="backpack-visual-grid"
                onPointerDown={(event) => beginDragRect("itemGrid", event)}
                style={{
                  position: "absolute",
                  left: grid.x,
                  top: grid.y,
                  width: grid.w,
                  height: grid.h,
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
                      pointerEvents: "none",
                    }}
                  />
                ))}
              </div>

              {/* detailPanel */}
              <div
                data-testid="backpack-visual-detail"
                onPointerDown={(event) => beginDragRect("detailPanel", event)}
                style={{
                  position: "absolute",
                  left: detail.x,
                  top: detail.y,
                  width: detail.w,
                  height: detail.h,
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
                <div
                  style={{
                    height: heroHeight,
                    maxHeight: "34%",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: `linear-gradient(145deg, ${accent}33 0%, #0d1a28 55%, #0a1220 100%)`,
                    pointerEvents: "none",
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 750,
                    pointerEvents: "none",
                  }}
                >
                  物品名称
                </div>
                <div
                  style={{
                    color: accent,
                    fontSize: 14,
                    pointerEvents: "none",
                  }}
                >
                  持有 ×1
                </div>
                <div
                  style={{
                    color: "rgba(220,230,235,0.7)",
                    fontSize: 14,
                    pointerEvents: "none",
                  }}
                >
                  详情预览区
                </div>
              </div>

              {/* craftButton 预览：detail 底边 + offsetY，竖直拖改 offsetY */}
              <div
                data-testid="backpack-visual-craft"
                onPointerDown={beginDragCraftOffset}
                style={{
                  position: "absolute",
                  left: craftRect.x,
                  top: craftRect.y,
                  width: craftRect.w,
                  height: craftRect.h,
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  border: `1px solid ${accent}`,
                  background: `${accent}33`,
                  cursor: "ns-resize",
                  touchAction: "none",
                  userSelect: "none",
                  ...craftBoxCss,
                  ...craftTextCss,
                }}
              >
                {craftLabel}
              </div>

              {selectionRect ? (
                <SelectionOverlay
                  rect={selectionRect}
                  scale={scale}
                  resizable={selectionResizable}
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
