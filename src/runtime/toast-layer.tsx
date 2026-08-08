/**
 * toast-layer.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 运行时轻提示层：展示 toast 队列 current，按 enter+hold+exit 时长推进。
 * Task 3：使用 `computeToastAnchorStyle` + `applyUiBoxStyle`/`applyUiTextStyle`，
 * 消费 placement / offset / gap / style，不再硬编码颜色或固定 `y-48`。
 */

import React, { useEffect, useMemo } from "react";
import type { ToastQueueState, ToastRequest } from "../domain/toast-queue";
import type { ElementMotion, HotspotElement } from "../domain/types";
import {
  normToWorld,
  type ContentRect,
} from "../shared/scene-layout";
import { computeToastAnchorStyle } from "../domain/item-toast-config";
import { applyUiBoxStyle, applyUiTextStyle } from "../domain/ui-style";

/** 无 motion 时长时的默认总展示时间（毫秒） */
export const TOAST_DEFAULT_TOTAL_MS = 1500;

/** 默认 hold（停留）时长（毫秒） */
export const TOAST_DEFAULT_HOLD_MS = 900;

/** toast 生命周期相位 */
type ToastPhase = "enter" | "shown" | "exit";

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

  // 可视下限，避免闪一下
  return Math.max(TOAST_DEFAULT_TOTAL_MS, total);
}

/**
 * 拆分 enter / hold / exit 各段毫秒，供相位计时。
 *
 * @param motion - toast 动效
 * @returns `{ enterMs, holdMs, exitMs }`
 */
function splitToastTiming(motion: ElementMotion): {
  enterMs: number;
  holdMs: number;
  exitMs: number;
} {
  const enterMs = Math.max(
    0,
    (motion.enter?.delayMs ?? 0) + (motion.enter?.durationMs ?? 0),
  );
  const rawExit =
    (motion.exit?.delayMs ?? 0) + (motion.exit?.durationMs ?? 0);
  /** 退场至少 80ms，保证 exit 相位可见 */
  const exitMs = Math.max(80, rawExit > 0 ? rawExit : 220);
  const total = estimateToastDisplayMs(motion);
  const holdMs = Math.max(120, total - enterMs - exitMs);

  return { enterMs, holdMs, exitMs };
}

/**
 * 由 motion preset 生成进场 / 退场样式（CSS transition）。
 *
 * 所有 transform 均在 `baseTransform`（placement 决定的基准 translate）上叠加，
 * 保证进场/退场动画不会覆盖锚点定位。
 *
 * @param motion - 动效
 * @param phase - `"enter"` | `"shown"` | `"exit"`
 * @param baseTransform - placement 解析后的基准 transform（如 `translate(-50%, -100%)`）
 * @returns 内联样式片段
 */
function toastMotionStyle(
  motion: ElementMotion,
  phase: ToastPhase,
  baseTransform: string,
): React.CSSProperties {
  const useExit = phase === "exit";
  const segment = useExit ? motion.exit : motion.enter;
  const duration = Math.max(80, segment.durationMs || 300);
  const delay = Math.max(0, segment.delayMs || 0);
  const preset = segment.preset;

  const base: React.CSSProperties = {
    transitionProperty: "opacity, transform",
    transitionDuration: `${duration}ms`,
    transitionDelay: `${delay}ms`,
    transitionTimingFunction: useExit ? "ease-in" : "ease-out",
  };

  if (phase === "enter" || phase === "exit") {
    switch (preset) {
      case "fade":
        return { ...base, opacity: 0 };
      case "scale":
        return {
          ...base,
          opacity: 0,
          transform: `${baseTransform} scale(0.85)`,
        };
      case "slideUp":
        return {
          ...base,
          opacity: 0,
          transform: `${baseTransform} translateY(12px)`,
        };
      case "slideDown":
        return {
          ...base,
          opacity: 0,
          transform: `${baseTransform} translateY(-12px)`,
        };
      case "slideLeft":
        return {
          ...base,
          opacity: 0,
          transform: `${baseTransform} translateX(12px)`,
        };
      case "slideRight":
        return {
          ...base,
          opacity: 0,
          transform: `${baseTransform} translateX(-12px)`,
        };
      default:
        return { ...base, opacity: 0 };
    }
  }

  return {
    ...base,
    opacity: 1,
    transform: baseTransform,
  };
}

/**
 * 轻提示叠层：锚在交互点上方，队列 FIFO；enter → hold → exit 后再 `onAdvance`。
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
  const [phase, setPhase] = React.useState<ToastPhase>("enter");

  const timing = useMemo(
    () => (current ? splitToastTiming(current.motion) : null),
    [current],
  );

  /**
   * 新 toast：先进场 → shown；hold 后切 exit；exit 结束后推进队列。
   */
  useEffect(() => {
    if (current === null || timing === null) {
      return;
    }

    setPhase("enter");

    const enterRaf = window.requestAnimationFrame(() => {
      setPhase("shown");
    });

    const exitTimer = window.setTimeout(() => {
      setPhase("exit");
    }, timing.enterMs + timing.holdMs);

    const advanceTimer = window.setTimeout(() => {
      onAdvance();
    }, timing.enterMs + timing.holdMs + timing.exitMs);

    return () => {
      window.cancelAnimationFrame(enterRaf);
      window.clearTimeout(exitTimer);
      window.clearTimeout(advanceTimer);
    };
  }, [current?.id, timing, onAdvance]);

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

  const layout = computeToastAnchorStyle(anchorPos, {
    placement: current.placement,
    offsetX: current.offsetX,
    offsetY: current.offsetY,
    gap: current.gap,
  });

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
        data-toast-phase={phase}
        style={{
          position: "absolute",
          left: layout.left,
          top: layout.top,
          padding: "8px 14px",
          whiteSpace: "nowrap",
          maxWidth: 280,
          overflow: "hidden",
          textOverflow: "ellipsis",
          ...applyUiBoxStyle(current.style),
          ...applyUiTextStyle(current.style),
          ...toastMotionStyle(current.motion, phase, layout.transform),
        }}
      >
        {text}
      </div>
    </div>
  );
}
