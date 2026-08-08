/**
 * toast-layer.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 运行时轻提示层：展示 toast 队列 current，按 enter+hold+exit 时长推进。
 */

import React, { useEffect, useMemo } from "react";
import type { ToastQueueState, ToastRequest } from "../domain/toast-queue";
import type { ElementMotion, HotspotElement } from "../domain/types";
import {
  normToWorld,
  type ContentRect,
} from "../shared/scene-layout";

/** 无 motion 时长时的默认总展示时间（毫秒） */
export const TOAST_DEFAULT_TOTAL_MS = 1500;

/** 默认 hold（停留）时长（毫秒） */
export const TOAST_DEFAULT_HOLD_MS = 900;

/**
 * ToastLayer 组件属性。
 */
export interface ToastLayerProps {
  /** 轻提示队列快照 */
  queue: ToastQueueState;

  /**
   * 推进队列（current 展示结束后调用）。
   */
  onAdvance: () => void;

  /** 当前场景交互点（用于锚点定位） */
  hotspots: HotspotElement[];

  /** 归一化参照矩形 */
  contentRect: ContentRect;

  /**
   * 空 text 时按物品名回退的查找。
   *
   * @param toast - 当前 toast
   * @returns 展示文案
   */
  resolveText?: (toast: ToastRequest) => string;
}

/**
 * 根据 toastMotion 估算单条展示总时长（enter + hold + exit）。
 *
 * - enter / exit 时长取 `delayMs + durationMs`
 * - hold 默认 {@link TOAST_DEFAULT_HOLD_MS}
 * - 若两侧均为 0（preset none 且 duration 被钳到 0），回退 {@link TOAST_DEFAULT_TOTAL_MS}
 *
 * @param motion - toast 动效
 * @returns 毫秒
 *
 * @example
 * const ms = estimateToastDisplayMs(toast.motion); // ≈ enter+hold+exit
 */
export function estimateToastDisplayMs(motion: ElementMotion): number {
  const enterMs = Math.max(
    0,
    (motion.enter?.delayMs ?? 0) + (motion.enter?.durationMs ?? 0),
  );
  const exitMs = Math.max(
    0,
    (motion.exit?.delayMs ?? 0) + (motion.exit?.durationMs ?? 0),
  );
  const total = enterMs + TOAST_DEFAULT_HOLD_MS + exitMs;

  if (total <= TOAST_DEFAULT_HOLD_MS && enterMs === 0 && exitMs === 0) {
    return TOAST_DEFAULT_TOTAL_MS;
  }

  // 下限下限，避免闪一下
  return Math.max(TOAST_DEFAULT_TOTAL_MS, total);
}

/**
 * 由 motion preset 生成简单进场样式（CSS transition）。
 *
 * @param motion - 动效
 * @param phase - `"enter"` | `"shown"`
 * @returns 内联样式片段
 */
function toastMotionStyle(
  motion: ElementMotion,
  phase: "enter" | "shown",
): React.CSSProperties {
  const duration = Math.max(80, motion.enter.durationMs || 300);
  const delay = Math.max(0, motion.enter.delayMs || 0);
  const preset = motion.enter.preset;

  const base: React.CSSProperties = {
    transitionProperty: "opacity, transform",
    transitionDuration: `${duration}ms`,
    transitionDelay: `${delay}ms`,
    transitionTimingFunction: "ease-out",
  };

  if (phase === "enter") {
    switch (preset) {
      case "fade":
        return { ...base, opacity: 0 };
      case "scale":
        return { ...base, opacity: 0, transform: "translate(-50%, 0) scale(0.85)" };
      case "slideUp":
        return { ...base, opacity: 0, transform: "translate(-50%, 12px)" };
      case "slideDown":
        return { ...base, opacity: 0, transform: "translate(-50%, -12px)" };
      case "slideLeft":
        return { ...base, opacity: 0, transform: "translate(calc(-50% + 12px), 0)" };
      case "slideRight":
        return { ...base, opacity: 0, transform: "translate(calc(-50% - 12px), 0)" };
      default:
        return { ...base, opacity: 0 };
    }
  }

  return {
    ...base,
    opacity: 1,
    transform: "translate(-50%, 0) scale(1)",
  };
}

/**
 * 轻提示叠层：锚在交互点上方，队列 FIFO，展示结束后 `onAdvance`。
 *
 * @param props - ToastLayerProps
 * @returns toast 层节点；无 current 时返回 null
 *
 * @example
 * ```tsx
 * <ToastLayer
 *   queue={toastQueue}
 *   onAdvance={() => setToastQueue((q) => advanceToastQueue(q))}
 *   hotspots={scene.hotspots}
 *   contentRect={layout.contentRect}
 * />
 * ```
 */
export function ToastLayer({
  queue,
  onAdvance,
  hotspots,
  contentRect,
  resolveText,
}: ToastLayerProps): React.ReactElement | null {
  const current = queue.current;
  const [phase, setPhase] = React.useState<"enter" | "shown">("enter");

  const displayMs = useMemo(
    () => (current ? estimateToastDisplayMs(current.motion) : 0),
    [current],
  );

  /**
   * current 变化后启动计时，到期推进队列。
   */
  useEffect(() => {
    if (current === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      onAdvance();
    }, displayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [current?.id, displayMs, onAdvance]);

  /**
   * 新 toast 先进场再切到 shown，触发 CSS transition。
   */
  useEffect(() => {
    if (current === null) {
      return;
    }

    setPhase("enter");
    const raf = window.requestAnimationFrame(() => {
      setPhase("shown");
    });

    return () => window.cancelAnimationFrame(raf);
  }, [current?.id]);

  if (current === null) {
    return null;
  }

  const anchor = hotspots.find((h) => h.id === current.anchorHotspotId);
  const anchorPos = anchor
    ? normToWorld(anchor.x, anchor.y, contentRect)
    : {
        x: contentRect.originX + contentRect.width / 2,
        y: contentRect.originY + contentRect.height * 0.35,
      };

  const text =
    resolveText !== undefined
      ? resolveText(current)
      : current.text.trim() !== ""
        ? current.text
        : "获得物品";

  return (
    <div
      data-testid="runtime-toast-layer"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      <div
        data-testid="runtime-toast-current"
        data-toast-id={current.id}
        style={{
          position: "absolute",
          left: anchorPos.x,
          top: anchorPos.y - 48,
          transform: "translate(-50%, 0)",
          padding: "8px 14px",
          borderRadius: 8,
          background: "rgba(10, 14, 12, 0.88)",
          color: "#F5F7F6",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.02em",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          whiteSpace: "nowrap",
          maxWidth: 280,
          overflow: "hidden",
          textOverflow: "ellipsis",
          ...toastMotionStyle(current.motion, phase),
        }}
      >
        {text}
      </div>
    </div>
  );
}
