import { chakra } from "@chakra-ui/react";
/**
 * resize-handles.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 选中交互点的 8 点边框缩放手柄（编辑模式）。
 * 默认嵌在元素外壳内（layout=fill）；角默认锁宽高比，Shift 自由比例。
 */

import React, { useRef } from "react";
import { screenBoxToLocal, screenDeltaToLocal } from "../../shared/dom-coords";
import {
  applyResizeDrag,
  isCornerHandle,
  type ResizeBox,
  type ResizeHandleId,
} from "./resize-math";

/**
 * ResizeHandles 属性。
 */
export interface ResizeHandlesProps {
  /**
   * 绝对定位模式用的盒（CSS px，中心锚点）。
   * `layout="fill"` 时可省略。
   */
  box?: ResizeBox;

  /**
   * - `"fill"`：`inset:0` 贴合父元素（推荐）
   * - `"absolute"`：按 `box` 定位
   */
  layout?: "fill" | "absolute";

  /** 最小宽 */
  minWidth?: number;

  /** 最小高 */
  minHeight?: number;

  /** 手柄强调色（默认场景交互青绿） */
  accentColor?: string;

  /**
   * 拖拽过程预览。
   *
   * @param next - 新盒
   * @param meta - shiftKey 等
   */
  onResizeLive?: (next: ResizeBox, meta: { shiftKey: boolean }) => void;

  /**
   * 松手提交。
   *
   * @param next - 最终盒
   * @param meta - shiftKey 等
   */
  onResizeCommit: (next: ResizeBox, meta: { shiftKey: boolean }) => void;
}

const HANDLES: ResizeHandleId[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
];

/**
 * 手柄对应 CSS cursor。
 *
 * @param id - 手柄
 * @returns cursor 值
 */
function cursorFor(id: ResizeHandleId): string {
  switch (id) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    default:
      return "nwse-resize";
  }
}

/**
 * 手柄在盒上的定位。
 *
 * @param id - 手柄
 * @param accentColor - 手柄填充色
 * @returns CSS 定位片段
 */
function handleStyle(
  id: ResizeHandleId,
  accentColor: string,
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 8,
    height: 8,
    marginLeft: -4,
    marginTop: -4,
    boxSizing: "border-box",
    borderRadius: 1,
    background: accentColor,
    border: "1px solid #FFFFFF",
    pointerEvents: "auto",
    zIndex: 2,
  };

  const map: Record<ResizeHandleId, React.CSSProperties> = {
    n: { left: "50%", top: 0 },
    s: { left: "50%", top: "100%" },
    e: { left: "100%", top: "50%" },
    w: { left: 0, top: "50%" },
    ne: { left: "100%", top: 0 },
    nw: { left: 0, top: 0 },
    se: { left: "100%", top: "100%" },
    sw: { left: 0, top: "100%" },
  };

  return { ...base, ...map[id], cursor: cursorFor(id) };
}

/**
 * 查找手柄所属的 overlay 根（用于把 client 坐标换成 overlay 内坐标）。
 *
 * @param node - 起始节点
 * @returns overlay HTMLElement 或 null
 */
function findOverlayRoot(node: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = node;

  while (cur !== null) {
    const testId = cur.getAttribute("data-testid") ?? "";

    if (testId === "hotspot-layer") {
      return cur;
    }

    cur = cur.parentElement;
  }

  return null;
}

/**
 * 由 frame 与 overlay 的 bounding rect 得到中心锚点盒（overlay 本地 CSS px）。
 *
 * @param frame - 手柄框元素
 * @param overlay - overlay 根
 * @returns ResizeBox
 */
function measureBoxInOverlay(
  frame: HTMLElement,
  overlay: HTMLElement,
): ResizeBox {
  const fr = frame.getBoundingClientRect();
  const or = overlay.getBoundingClientRect();

  return screenBoxToLocal(overlay, {
    width: Math.max(1, fr.width),
    height: Math.max(1, fr.height),
    centerLeft: fr.left - or.left + fr.width / 2,
    centerTop: fr.top - or.top + fr.height / 2,
  });
}

/**
 * 8 点缩放手柄。
 *
 * @param props - ResizeHandlesProps
 * @returns 手柄层
 *
 * @example
 * ```tsx
 * <ResizeHandles
 *   layout="fill"
 *   onResizeCommit={(next) => commitSize(next)}
 * />
 * ```
 */
export function ResizeHandles({
  box,
  layout = "fill",
  minWidth = 8,
  minHeight = 8,
  accentColor = "#2EC4A4",
  onResizeLive,
  onResizeCommit,
}: ResizeHandlesProps): React.ReactElement {
  const frameRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<{
    handle: ResizeHandleId;
    start: ResizeBox;
    originX: number;
    originY: number;
    shiftKey: boolean;
    last: ResizeBox;
  } | null>(null);

  /**
   * 解析拖拽起始盒：优先 DOM 实测，否则回退 props.box。
   *
   * @returns ResizeBox
   */
  const resolveStartBox = (): ResizeBox => {
    const frame = frameRef.current;

    if (frame !== null) {
      const overlay = findOverlayRoot(frame);

      if (overlay !== null) {
        return measureBoxInOverlay(frame, overlay);
      }
    }

    if (box !== undefined) {
      return { ...box };
    }

    return { width: minWidth, height: minHeight, centerLeft: 0, centerTop: 0 };
  };

  /**
   * 开始拖某一手柄。
   *
   * @param event - 指针事件
   * @param handle - 手柄 id
   */
  const onPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    handle: ResizeHandleId,
  ): void => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const start = resolveStartBox();

    sessionRef.current = {
      handle,
      start,
      originX: event.clientX,
      originY: event.clientY,
      shiftKey: event.shiftKey,
      last: start,
    };
  };

  /**
   * 拖拽移动。
   *
   * @param event - 指针事件
   */
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const session = sessionRef.current;

    if (session === null) {
      return;
    }

    const overlay =
      frameRef.current !== null ? findOverlayRoot(frameRef.current) : null;
    const screenDx = event.clientX - session.originX;
    const screenDy = event.clientY - session.originY;
    const { dx, dy } =
      overlay !== null
        ? screenDeltaToLocal(overlay, screenDx, screenDy)
        : { dx: screenDx, dy: screenDy };
    const shiftKey = event.shiftKey;
    const lockAspect = isCornerHandle(session.handle) && !shiftKey;

    const next = applyResizeDrag({
      handle: session.handle,
      start: session.start,
      dx,
      dy,
      lockAspect,
      minWidth,
      minHeight,
    });

    session.shiftKey = shiftKey;
    session.last = next;
    onResizeLive?.(next, { shiftKey });
  };

  /**
   * 结束拖拽。
   *
   * @param event - 指针事件
   */
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const session = sessionRef.current;

    if (session === null) {
      return;
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    const last = session.last;
    const shiftKey = session.shiftKey;

    sessionRef.current = null;
    onResizeCommit(last, { shiftKey });
  };

  const frameStyle: React.CSSProperties =
    layout === "fill"
      ? {
          position: "absolute",
          inset: 0,
          boxSizing: "border-box",
          border: `1px solid ${accentColor}`,
          pointerEvents: "none",
          zIndex: 5,
        }
      : {
          position: "absolute",
          left: box?.centerLeft ?? 0,
          top: box?.centerTop ?? 0,
          width: box?.width ?? minWidth,
          height: box?.height ?? minHeight,
          transform: "translate(-50%, -50%)",
          boxSizing: "border-box",
          border: `1px solid ${accentColor}`,
          pointerEvents: "none",
          zIndex: 5,
        };

  return (
    <chakra.div
      ref={frameRef}
      data-testid="resize-handles"
      data-layout={layout}
      style={frameStyle}
    >
      {HANDLES.map((id) => (
        <chakra.div
          key={id}
          data-testid={`resize-handle-${id}`}
          data-handle={id}
          style={handleStyle(id, accentColor)}
          onPointerDown={(e) => onPointerDown(e, id)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      ))}
    </chakra.div>
  );
}
