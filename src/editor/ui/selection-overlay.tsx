/**
 * selection-overlay.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 自由布局编辑器选中叠层：在设计坐标 rect 上绘制高亮描边与八向缩放手柄。
 * 手柄尺寸按 scale 反算，保证 letterbox 缩放下屏幕像素大小稳定。
 * 实际 resize 会话由父级（画布）通过 onResizeStart 接管。
 */

import React from "react";
import type { UiRect } from "../../domain/types";
import type { ResizeHandle } from "./free-layout-selection";

/** 手柄在屏幕上的目标边长（CSS px）。 */
const HANDLE_SCREEN_PX = 8;

/**
 * SelectionOverlay 组件属性。
 */
export interface SelectionOverlayProps {
  /**
   * 选中区域（设计像素，左上角锚点 + 宽高）。
   *
   * 须含 w/h，供描边与手柄定位。
   */
  rect: Required<UiRect>;

  /**
   * 舞台 letterbox 缩放比（设计 → 屏幕）。
   *
   * 用于将 HANDLE_SCREEN_PX 换算为设计空间尺寸。
   */
  scale: number;

  /**
   * 是否渲染八向缩放手柄。
   *
   * 为 false 时仅显示选中描边（如 quickbarRoot 仅调 slotSize）。
   */
  resizable: boolean;

  /** 描边 / 手柄强调色；缺省为编辑青绿。 */
  accentColor?: string;

  /**
   * 用户按下某缩放手柄时回调。
   *
   * 父级应 stopPropagation、setPointerCapture，并在 move/up 中调用 applyResize。
   *
   * @param handle - 八向手柄 id
   * @param event - 原生 React 指针事件（含 clientX/Y、shiftKey）
   */
  onResizeStart: (
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLDivElement>,
  ) => void;
}

/** 八向手柄枚举（与 free-layout-selection 一致）。 */
const HANDLES: ResizeHandle[] = [
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
 * @param id - 手柄 id
 * @returns cursor 字符串
 */
function cursorFor(id: ResizeHandle): string {
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
 * 将屏幕像素手柄尺寸换算为设计空间尺寸。
 *
 * @param scale - 舞台缩放比
 * @returns 设计像素边长（至少 1）
 */
function handleDesignSize(scale: number): number {
  const safeScale = scale > 0 ? scale : 0.001;

  return Math.max(1, HANDLE_SCREEN_PX / safeScale);
}

/**
 * 生成单个手柄的定位与尺寸样式。
 *
 * @param id - 手柄 id
 * @param accentColor - 填充色
 * @param handleSize - 设计空间边长
 * @returns CSSProperties
 */
function handleStyle(
  id: ResizeHandle,
  accentColor: string,
  handleSize: number,
): React.CSSProperties {
  const half = handleSize / 2;

  const base: React.CSSProperties = {
    position: "absolute",
    width: handleSize,
    height: handleSize,
    marginLeft: -half,
    marginTop: -half,
    boxSizing: "border-box",
    borderRadius: 1,
    background: accentColor,
    border: "1px solid #FFFFFF",
    pointerEvents: "auto",
    zIndex: 2,
    touchAction: "none",
  };

  const map: Record<ResizeHandle, React.CSSProperties> = {
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
 * 选中叠层：设计坐标 rect + 按 scale 绘制的手柄。
 *
 * 须置于已 scale 的设计舞台容器内（如 hud-visual-stage）。
 *
 * @param props - SelectionOverlayProps
 * @returns 选中描边与可选手柄层
 *
 * @example
 * ```tsx
 * <SelectionOverlay
 *   rect={{ x: 100, y: 80, w: 200, h: 48 }}
 *   scale={world.scale}
 *   resizable
 *   onResizeStart={(handle, event) => beginResize(handle, event)}
 * />
 * ```
 */
export function SelectionOverlay({
  rect,
  scale,
  resizable,
  accentColor = "#2EC4A4",
  onResizeStart,
}: SelectionOverlayProps): React.ReactElement {
  const handleSize = handleDesignSize(scale);

  /**
   * 手柄 pointerDown：阻止冒泡并交给父级开启 resize 会话。
   *
   * @param event - 指针事件
   * @param handle - 手柄 id
   */
  const onHandlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    handle: ResizeHandle,
  ): void => {
    event.stopPropagation();
    event.preventDefault();
    onResizeStart(handle, event);
  };

  return (
    <div
      data-testid="selection-overlay"
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        boxSizing: "border-box",
        border: `1px solid ${accentColor}`,
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {resizable
        ? HANDLES.map((id) => (
            <div
              key={id}
              data-testid={`selection-handle-${id}`}
              data-handle={id}
              style={handleStyle(id, accentColor, handleSize)}
              onPointerDown={(event) => onHandlePointerDown(event, id)}
            />
          ))
        : null}
    </div>
  );
}
