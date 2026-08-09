/**
 * reward-fly-layer.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 获得物品奖励轻提示：场景壳正中（50%/50%）不透底板 + 物品图标发光，
 * 再快速飞向快捷栏对应格子。避免半透明光晕透出场景导致「奖励图标不对」。
 */

import React, { useEffect, useRef, useState } from "react";
import type { RewardFlyQueueState } from "../domain/reward-fly";

/** 中心出现 + 发光停留（毫秒） */
const APPEAR_MS = 420;
const HOLD_MS = 520;
/** 飞向槽位（毫秒） */
const FLY_MS = 420;
/** 图标中心展示边长（css px） */
const CENTER_SIZE = 112;
/** 飞入结束时缩放到槽位约略尺寸 */
const SLOT_SIZE = 48;

type FlyPhase = "appear" | "hold" | "fly" | "done";

/**
 * RewardFlyLayer 属性。
 */
export interface RewardFlyLayerProps {
  /** 飞入队列 */
  queue: RewardFlyQueueState;

  /** 当前条结束后推进 */
  onAdvance: () => void;
}

/**
 * 转义 CSS 属性选择器中的特殊字符。
 *
 * @param value - 原始字符串
 * @returns 可安全写入属性选择器的值
 */
function escapeAttr(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * 宿主本地中心。
 *
 * @param host - 飞入层宿主
 * @returns 中心点
 */
function hostCenterLocal(host: HTMLElement): { x: number; y: number } {
  const rect = host.getBoundingClientRect();

  return {
    x: Math.max(1, rect.width) / 2,
    y: Math.max(1, rect.height) / 2,
  };
}

/**
 * 将快捷栏槽中心换算为相对 host 的本地坐标。
 *
 * @param host - 飞入层宿主
 * @param itemId - 物品 id
 * @param slotIndex - 槽下标
 * @returns 本地中心；找不到则 null
 */
function resolveSlotCenterLocal(
  host: HTMLElement,
  itemId: string,
  slotIndex: number,
): { x: number; y: number } | null {
  const byItem = document.querySelector(
    `[data-testid="backpack-quickbar-slot"][data-item-id="${escapeAttr(itemId)}"]`,
  );

  const el =
    byItem ??
    document.querySelector(
      `[data-testid="backpack-quickbar-slot"][data-slot-index="${slotIndex}"]`,
    );

  if (!(el instanceof HTMLElement)) {
    return null;
  }

  const hostRect = host.getBoundingClientRect();
  const slotRect = el.getBoundingClientRect();

  if (slotRect.width <= 0 || slotRect.height <= 0) {
    return null;
  }

  return {
    x: slotRect.left + slotRect.width / 2 - hostRect.left,
    y: slotRect.top + slotRect.height / 2 - hostRect.top,
  };
}

/**
 * 奖励飞入叠层。
 *
 * @param props - 队列与推进回调
 * @returns 叠层节点
 */
export function RewardFlyLayer({
  queue,
  onAdvance,
}: RewardFlyLayerProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const current = queue.current;
  const [phase, setPhase] = useState<FlyPhase>("appear");
  /** 相对宿主中心的飞入位移；未飞时为 0 */
  const [delta, setDelta] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (current === null) {
      return;
    }

    setPhase("appear");
    setDelta({ x: 0, y: 0 });

    const holdTimer = window.setTimeout(() => {
      setPhase("hold");
    }, APPEAR_MS);

    const flyTimer = window.setTimeout(() => {
      setPhase("fly");
      window.requestAnimationFrame(() => {
        const host = hostRef.current;

        if (host === null) {
          return;
        }

        const center = hostCenterLocal(host);
        const slot = resolveSlotCenterLocal(
          host,
          current.itemId,
          current.slotIndex,
        );
        const end = slot ?? center;
        setDelta({ x: end.x - center.x, y: end.y - center.y });
      });
    }, APPEAR_MS + HOLD_MS);

    const doneTimer = window.setTimeout(() => {
      setPhase("done");
      onAdvance();
    }, APPEAR_MS + HOLD_MS + FLY_MS);

    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(flyTimer);
      window.clearTimeout(doneTimer);
    };
  }, [current?.id, onAdvance]);

  if (current === null) {
    return (
      <div
        ref={hostRef}
        data-testid="reward-fly-layer"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 120,
        }}
      />
    );
  }

  const flying = phase === "fly" || phase === "done";
  const size = flying ? SLOT_SIZE : CENTER_SIZE;
  const opacity = phase === "done" ? 0 : 1;
  const scale =
    phase === "appear" ? 0.5 : phase === "hold" ? 1 : flying ? 0.55 : 1;

  return (
    <div
      ref={hostRef}
      data-testid="reward-fly-layer"
      data-reward-phase={phase}
      data-reward-item={current.itemId}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 120,
        overflow: "hidden",
      }}
    >
      <style>{`
@keyframes si-reward-glow-pulse {
  0% { opacity: 0.65; transform: translate(-50%, -50%) scale(0.9); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.12); }
  100% { opacity: 0.75; transform: translate(-50%, -50%) scale(1); }
}
@keyframes si-reward-ray-spin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
`}</style>

      {/* 整组锚定宿主正中，飞入只改 translate 位移 */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 0,
          height: 0,
          transform: `translate(calc(-50% + ${delta.x}px), calc(-50% + ${delta.y}px))`,
          transition: flying
            ? `transform ${FLY_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
            : "none",
        }}
      >
        {/* 外圈柔光：飞入时淡出；不再透出场景主体 */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 240,
            height: 240,
            borderRadius: "50%",
            pointerEvents: "none",
            opacity: flying ? 0 : 1,
            transition: `opacity ${FLY_MS}ms ease`,
            background:
              "radial-gradient(circle, rgba(255,220,120,0.5) 0%, rgba(255,180,60,0.2) 40%, rgba(0,0,0,0) 70%)",
            boxShadow: "0 0 40px 12px rgba(255, 200, 80, 0.28)",
            animation: flying
              ? "none"
              : "si-reward-glow-pulse 900ms ease-in-out infinite",
            transform: "translate(-50%, -50%)",
          }}
        />

        {!flying ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 170,
              height: 170,
              pointerEvents: "none",
              opacity: 0.9,
              background:
                "conic-gradient(from 0deg, transparent 0deg, rgba(255,230,140,0.55) 40deg, transparent 80deg, rgba(255,210,90,0.4) 200deg, transparent 240deg)",
              maskImage:
                "radial-gradient(circle, transparent 30%, #000 42%, #000 58%, transparent 72%)",
              WebkitMaskImage:
                "radial-gradient(circle, transparent 30%, #000 42%, #000 58%, transparent 72%)",
              animation: "si-reward-ray-spin 2.4s linear infinite",
              transform: "translate(-50%, -50%)",
            }}
          />
        ) : null}

        {/* 不透底板：保证看到的是物品图，而不是场景香炉 */}
        <div
          data-testid="reward-fly-icon"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: size,
            height: size,
            transform: `translate(-50%, -50%) scale(${scale})`,
            opacity,
            transition: flying
              ? `width ${FLY_MS}ms ease, height ${FLY_MS}ms ease, transform ${FLY_MS}ms ease, opacity ${FLY_MS}ms ease`
              : `transform ${APPEAR_MS}ms cubic-bezier(0.2, 1.4, 0.3, 1), opacity ${APPEAR_MS}ms ease`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            padding: flying ? 2 : 10,
            borderRadius: flying ? 8 : 20,
            background: flying
              ? "transparent"
              : "radial-gradient(circle at 50% 45%, #3a3428 0%, #1a1712 70%, #0d0c0a 100%)",
            border: flying ? "none" : "2px solid rgba(255, 214, 120, 0.65)",
            boxShadow: flying
              ? "none"
              : "0 8px 28px rgba(0,0,0,0.55), inset 0 0 18px rgba(255,200,80,0.12)",
            filter: flying
              ? "drop-shadow(0 0 6px rgba(255,220,120,0.55))"
              : "drop-shadow(0 0 16px rgba(255,220,120,0.85))",
          }}
        >
          {current.iconUrl ? (
            <img
              src={current.iconUrl}
              alt={current.displayName}
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                pointerEvents: "none",
              }}
            />
          ) : (
            <span
              style={{
                color: "#fff8e0",
                fontSize: 13,
                fontWeight: 700,
                textAlign: "center",
                textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                padding: 4,
              }}
            >
              {current.displayName || "获得物品"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
