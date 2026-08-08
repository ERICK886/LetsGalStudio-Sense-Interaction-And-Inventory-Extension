/**
 * hotspot-layer.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 场景画布上的交互点层：框选显示、拖拽移动、选中后 8 点拉伸改大小。
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { HotspotElement } from "../../domain/types";
import { clamp01 } from "../../shared/coords";
import {
  clientToLocal,
  normToWorld,
  worldToNorm,
  type ContentRect,
} from "../../shared/scene-layout";
import { useTheme } from "../../theme/theme-provider";
import { ResizeHandles } from "./resize-handles";
import type { ResizeBox } from "./resize-math";

/** 无图时的默认占位边长（设计像素） */
export const HOTSPOT_PLACEHOLDER_SIZE = 64;

/** 拉伸最小边长（设计像素），对齐大地图地点下限 */
export const HOTSPOT_MIN_SIZE = 8;

/**
 * 交互点几何提交（中心归一化 + 设计像素宽高）。
 */
export interface HotspotGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * HotspotLayer 属性。
 */
export interface HotspotLayerProps {
  /** 当前场景的交互点列表 */
  hotspots: HotspotElement[];

  /** 归一化参照矩形 */
  contentRect: ContentRect;

  /** 选中的 hotspot id */
  selectedId: string | null;

  /**
   * 选中回调。
   *
   * @param id - hotspot id
   */
  onSelect: (id: string) => void;

  /**
   * 拖拽结束写回归一化坐标。
   *
   * @param id - hotspot id
   * @param x - 归一化 X
   * @param y - 归一化 Y
   */
  onMove: (id: string, x: number, y: number) => void;

  /**
   * 边框拉伸松手提交：更新位置与 visual 宽高。
   *
   * @param id - hotspot id
   * @param geometry - 中心归一化坐标 + 设计像素尺寸
   */
  onResize: (id: string, geometry: HotspotGeometry) => void;

  /**
   * 解析资源 URI → 可加载 URL。
   *
   * @param uri - 领域 URI
   * @returns 可加载 URL；空串表示无图
   */
  resolveUrl: (uri: string) => string;

  /**
   * 承载 world transform 的 DOM（用于 client→设计坐标）。
   */
  worldElement: HTMLElement | null;
}

/**
 * 推算 hotspot 在设计画幅中的显示尺寸。
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
      : HOTSPOT_PLACEHOLDER_SIZE;
  const h =
    typeof hs.visual.height === "number" && hs.visual.height > 0
      ? hs.visual.height
      : HOTSPOT_PLACEHOLDER_SIZE;

  return { width: w, height: h };
}

/**
 * 拖拽移动会话状态。
 */
interface DragSession {
  id: string;
  pointerId: number;
  grabOffsetX: number;
  grabOffsetY: number;
}

/**
 * 交互点叠层：选中框 + 拖拽移动 + 拉伸手柄。
 *
 * @param props - HotspotLayerProps
 * @returns overlay 节点
 *
 * @example
 * ```tsx
 * <HotspotLayer
 *   hotspots={scene.hotspots}
 *   contentRect={layout.contentRect}
 *   selectedId={id}
 *   onSelect={setId}
 *   onMove={handleMove}
 *   onResize={handleResize}
 *   resolveUrl={resolve}
 *   worldElement={worldEl}
 * />
 * ```
 */
export function HotspotLayer({
  hotspots,
  contentRect,
  selectedId,
  onSelect,
  onMove,
  onResize,
  resolveUrl,
  worldElement,
}: HotspotLayerProps): React.ReactElement {
  const { tokens } = useTheme();
  const [dragPose, setDragPose] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [resizePose, setResizePose] = useState<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const sessionRef = useRef<DragSession | null>(null);
  const dragPoseRef = useRef<{ id: string; x: number; y: number } | null>(
    null,
  );
  const onMoveRef = useRef(onMove);
  const onResizeRef = useRef(onResize);
  const contentRectRef = useRef(contentRect);
  const worldElementRef = useRef(worldElement);

  onMoveRef.current = onMove;
  onResizeRef.current = onResize;
  contentRectRef.current = contentRect;
  worldElementRef.current = worldElement;
  dragPoseRef.current = dragPose;

  /**
   * 将 overlay 布局盒（设计像素）转为领域几何并提交预览/写回。
   *
   * @param next - ResizeHandles 给出的盒（相对 hotspot-layer）
   * @returns HotspotGeometry
   */
  const boxToGeometry = useCallback((next: ResizeBox): HotspotGeometry => {
    const norm = worldToNorm(
      next.centerLeft,
      next.centerTop,
      contentRectRef.current,
    );

    return {
      x: clamp01(norm.x),
      y: clamp01(norm.y),
      width: Math.max(HOTSPOT_MIN_SIZE, next.width),
      height: Math.max(HOTSPOT_MIN_SIZE, next.height),
    };
  }, []);

  /**
   * 指针按下：开始拖拽移动（手柄自身 stopPropagation，不会进这里）。
   *
   * @param event - 指针事件
   * @param hs - 目标 hotspot
   */
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, hs: HotspotElement) => {
      event.stopPropagation();
      event.preventDefault();

      onSelect(hs.id);

      const worldEl = worldElementRef.current;
      const center = normToWorld(hs.x, hs.y, contentRectRef.current);

      let localX = center.x;
      let localY = center.y;

      if (worldEl !== null) {
        const local = clientToLocal(worldEl, event.clientX, event.clientY);
        localX = local.x;
        localY = local.y;
      }

      sessionRef.current = {
        id: hs.id,
        pointerId: event.pointerId,
        grabOffsetX: localX - center.x,
        grabOffsetY: localY - center.y,
      };

      const initialPose = { id: hs.id, x: hs.x, y: hs.y };
      dragPoseRef.current = initialPose;
      setDragPose(initialPose);
      setResizePose(null);

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    },
    [onSelect],
  );

  useEffect(() => {
    /**
     * @param event - 指针移动
     */
    const onMoveEv = (event: PointerEvent): void => {
      const session = sessionRef.current;

      if (session === null || event.pointerId !== session.pointerId) {
        return;
      }

      const worldEl = worldElementRef.current;

      if (worldEl === null) {
        return;
      }

      const local = clientToLocal(worldEl, event.clientX, event.clientY);
      const centerX = local.x - session.grabOffsetX;
      const centerY = local.y - session.grabOffsetY;
      const norm = worldToNorm(centerX, centerY, contentRectRef.current);
      const next = {
        id: session.id,
        x: clamp01(norm.x),
        y: clamp01(norm.y),
      };

      dragPoseRef.current = next;
      setDragPose(next);
    };

    /**
     * @param event - 指针抬起
     */
    const onUpEv = (event: PointerEvent): void => {
      const session = sessionRef.current;

      if (session === null || event.pointerId !== session.pointerId) {
        return;
      }

      const pose =
        dragPoseRef.current !== null &&
        dragPoseRef.current.id === session.id
          ? dragPoseRef.current
          : null;

      sessionRef.current = null;
      dragPoseRef.current = null;

      if (pose !== null) {
        onMoveRef.current(session.id, pose.x, pose.y);
      }

      setDragPose(null);
    };

    window.addEventListener("pointermove", onMoveEv);
    window.addEventListener("pointerup", onUpEv);
    window.addEventListener("pointercancel", onUpEv);

    return () => {
      window.removeEventListener("pointermove", onMoveEv);
      window.removeEventListener("pointerup", onUpEv);
      window.removeEventListener("pointercancel", onUpEv);
    };
  }, []);

  return (
    <div
      data-testid="hotspot-layer"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {hotspots.map((hs) => {
        const resizing = resizePose?.id === hs.id ? resizePose : null;
        const poseX = resizing
          ? resizing.x
          : dragPose?.id === hs.id
            ? dragPose.x
            : hs.x;
        const poseY = resizing
          ? resizing.y
          : dragPose?.id === hs.id
            ? dragPose.y
            : hs.y;
        const baseSize = hotspotDisplaySize(hs);
        const width = resizing ? resizing.width : baseSize.width;
        const height = resizing ? resizing.height : baseSize.height;
        const center = normToWorld(poseX, poseY, contentRect);
        const selected = hs.id === selectedId;
        const url = resolveUrl(hs.visual.src);

        return (
          <div
            key={hs.id}
            data-testid={`hotspot-node-${hs.id}`}
            data-selected={selected ? "1" : "0"}
            onPointerDown={(e) => handlePointerDown(e, hs)}
            style={{
              position: "absolute",
              left: center.x - width / 2,
              top: center.y - height / 2,
              width,
              height,
              boxSizing: "border-box",
              border: selected
                ? `2px solid ${tokens.accent}`
                : "1px dashed rgba(180, 180, 200, 0.55)",
              borderRadius: 4,
              background: url ? "transparent" : "rgba(46, 196, 164, 0.12)",
              cursor: "grab",
              pointerEvents: "auto",
              // 选中时允许手柄溢出边框；图片仍由宽高约束
              overflow: selected ? "visible" : "hidden",
              boxShadow: selected ? `0 0 0 1px ${tokens.accent}55` : undefined,
              touchAction: "none",
            }}
          >
            {url ? (
              <img
                src={url}
                alt=""
                draggable={false}
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
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: tokens.textMuted,
                  fontSize: 11,
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              >
                交互点
              </div>
            )}

            {selected ? (
              <ResizeHandles
                layout="fill"
                minWidth={HOTSPOT_MIN_SIZE}
                minHeight={HOTSPOT_MIN_SIZE}
                accentColor={tokens.accent}
                onResizeLive={(next) => {
                  const geo = boxToGeometry(next);

                  setDragPose(null);
                  setResizePose({
                    id: hs.id,
                    x: geo.x,
                    y: geo.y,
                    width: geo.width,
                    height: geo.height,
                  });
                }}
                onResizeCommit={(next) => {
                  const geo = boxToGeometry(next);

                  onResizeRef.current(hs.id, geo);
                  setResizePose(null);
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
