/**
 * reward-fly-layer.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.5.2
 *
 * 获得物品奖励轻提示：设计画幅正中展示后飞向快捷栏槽位。
 * - 出现/停留：始终跟飞入宿主 letterbox 的设计中心
 * - 飞入终点：重叠 HUD 内的槽位 DOM（屏幕坐标→布局坐标，兼容预览 CSS scale）
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import { DEFAULT_DESIGN_WIDTH } from "../domain/design-resolution";
import { resolveHudLayout } from "../domain/hud-layout";
import {
  designPointToHostLocal,
  REWARD_FLY_CENTER_SIZE_DESIGN,
  REWARD_FLY_SLOT_SIZE_DESIGN,
  rewardFlySlotCenterDesign,
  type RewardFlyQueueState,
} from "../domain/reward-fly";
import { parseInventoryHudJson } from "../domain/serialize";
import { clientToLocal, fitDesignToHost } from "../shared/scene-layout";
import {
  INVENTORY_HUD_JSON_KEY,
  readHudSetting,
} from "../store/hud-settings";
import { useDesignSize } from "../store/use-design-size";

/** 中心出现 + 发光停留（毫秒） */
const APPEAR_MS = 420;
const HOLD_MS = 520;
/** 飞向槽位（毫秒） */
const FLY_MS = 420;

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
 * 两矩形是否大致重叠（允许少量外扩）。
 *
 * @param a - 矩形 A
 * @param b - 矩形 B
 * @param pad - 外扩像素
 * @returns 是否重叠
 */
function rectsOverlap(
  a: DOMRect,
  b: DOMRect,
  pad = 4,
): boolean {
  return (
    a.left < b.right + pad &&
    a.right > b.left - pad &&
    a.top < b.bottom + pad &&
    a.bottom > b.top - pad
  );
}

/**
 * 元素相对 host 的中心（宿主本地布局像素；兼容预览 CSS scale）。
 *
 * @param host - 飞入层宿主
 * @param el - 目标元素
 * @returns 本地中心；不可见则 null
 */
function elementCenterInHost(
  host: HTMLElement,
  el: HTMLElement,
): { x: number; y: number } | null {
  const hostRect = host.getBoundingClientRect();
  const rect = el.getBoundingClientRect();

  if (rect.width <= 1 || rect.height <= 1) {
    return null;
  }

  if (!rectsOverlap(hostRect, rect, 24)) {
    return null;
  }

  return clientToLocal(
    host,
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
  );
}

/**
 * 选取与飞入宿主重叠的 HUD 根（避免命中编辑器里其它隐藏实例）。
 *
 * @param host - 飞入层宿主
 * @returns HUD 根；没有则 null
 */
function pickOverlappingHudRoot(host: HTMLElement): HTMLElement | null {
  const hostRect = host.getBoundingClientRect();
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(`[data-testid="hud-shell"]`),
    ...document.querySelectorAll<HTMLElement>(
      `[data-testid="backpack-quickbar"]`,
    ),
  ];

  let best: HTMLElement | null = null;
  let bestArea = 0;

  for (const el of candidates) {
    const r = el.getBoundingClientRect();

    if (r.width <= 1 || r.height <= 1) {
      continue;
    }

    if (!rectsOverlap(hostRect, r, 8)) {
      continue;
    }

    const area = r.width * r.height;

    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  }

  return best;
}

/**
 * 在与飞入宿主重叠的 HUD 内找槽位中心。
 *
 * @param host - 飞入层宿主
 * @param itemId - 物品 id
 * @param slotIndex - 槽下标
 * @returns 本地中心；找不到则 null
 */
function resolveSlotCenterFromDom(
  host: HTMLElement,
  itemId: string,
  slotIndex: number,
): { x: number; y: number } | null {
  const hudRoot = pickOverlappingHudRoot(host);
  const scope: ParentNode = hudRoot ?? document;
  const nodes = Array.from(
    scope.querySelectorAll<HTMLElement>(
      `[data-testid="backpack-quickbar-slot"]`,
    ),
  )
    .map((el) => ({ el, center: elementCenterInHost(host, el) }))
    .filter(
      (row): row is { el: HTMLElement; center: { x: number; y: number } } =>
        row.center !== null,
    );

  if (nodes.length === 0) {
    return null;
  }

  const byItem = nodes.find(
    (row) =>
      row.el.getAttribute("data-item-id") === itemId && itemId.length > 0,
  );

  if (byItem) {
    return byItem.center;
  }

  const byIndex = nodes.find(
    (row) => row.el.getAttribute("data-slot-index") === String(slotIndex),
  );

  if (byIndex) {
    return byIndex.center;
  }

  return nodes[0]!.center;
}

/**
 * 按与飞入层重叠的 HUD 根，把设计坐标槽位中心换到飞入 host 本地。
 *
 * @param host - 飞入层宿主
 * @param designW - 设计宽
 * @param designH - 设计高
 * @param designX - 槽中心设计 X
 * @param designY - 槽中心设计 Y
 * @returns 本地中心；无 HUD 根则 null
 */
function resolveSlotCenterViaHudRoot(
  host: HTMLElement,
  designW: number,
  designH: number,
  designX: number,
  designY: number,
): { x: number; y: number } | null {
  const hudRoot = pickOverlappingHudRoot(host);

  if (hudRoot === null) {
    return null;
  }

  const hudRect = hudRoot.getBoundingClientRect();

  if (hudRect.width <= 1 || hudRect.height <= 1) {
    return null;
  }

  /**
   * 在 HUD 根的屏幕矩形内按 contain 居中映射设计坐标，
   * 再换算为飞入宿主的布局像素（含预览 CSS scale）。
   */
  const sx = hudRect.width / Math.max(1, designW);
  const sy = hudRect.height / Math.max(1, designH);
  const scale = Math.min(sx, sy);
  const offsetX = (hudRect.width - designW * scale) / 2;
  const offsetY = (hudRect.height - designH * scale) / 2;
  const screenX = hudRect.left + offsetX + designX * scale;
  const screenY = hudRect.top + offsetY + designY * scale;

  return clientToLocal(host, screenX, screenY);
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
  const ctx = useExtensionContext();
  const { size: designSize } = useDesignSize();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const current = queue.current;
  const [phase, setPhase] = useState<FlyPhase>("appear");
  /** 仅飞入阶段使用的终点；出现/停留不用此值，避免测到 0 尺寸时锁死 */
  const [flyEnd, setFlyEnd] = useState<{ x: number; y: number } | null>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });

  const hudLayout = useMemo(() => {
    const raw = readHudSetting(ctx, INVENTORY_HUD_JSON_KEY);
    const json = typeof raw === "string" ? raw : String(raw ?? "");
    const hud = parseInventoryHudJson(
      json,
      designSize.width,
      designSize.height,
    );

    return resolveHudLayout(hud);
  }, [ctx, designSize.height, designSize.width, current?.id]);

  const world = useMemo(
    () =>
      fitDesignToHost(
        Math.max(1, hostSize.w),
        Math.max(1, hostSize.h),
        designSize.width,
        designSize.height,
        1,
      ),
    [designSize.height, designSize.width, hostSize.h, hostSize.w],
  );

  const layoutScale = world.scale > 0 ? world.scale : 1;
  const designScale = designSize.width / DEFAULT_DESIGN_WIDTH;
  const centerSize = Math.max(
    36,
    Math.round(REWARD_FLY_CENTER_SIZE_DESIGN * designScale * layoutScale),
  );
  const slotSize = Math.max(
    20,
    Math.round(
      (hudLayout.root.slotSize > 0
        ? hudLayout.root.slotSize
        : REWARD_FLY_SLOT_SIZE_DESIGN) * layoutScale,
    ),
  );

  /** 出现点：始终跟当前宿主 letterbox 设计中心 */
  const appearPos = useMemo(
    () =>
      designPointToHostLocal(
        designSize.width / 2,
        designSize.height / 2,
        world.offsetX,
        world.offsetY,
        layoutScale,
      ),
    [
      designSize.height,
      designSize.width,
      layoutScale,
      world.offsetX,
      world.offsetY,
    ],
  );

  /**
   * 解析飞入终点（宿主本地）。
   *
   * @param host - 宿主
   * @param itemId - 物品 id
   * @param slotIndex - 槽下标
   * @returns 本地中心
   */
  const resolveFlyEnd = (
    host: HTMLElement,
    itemId: string,
    slotIndex: number,
  ): { x: number; y: number } => {
    const fromDom = resolveSlotCenterFromDom(host, itemId, slotIndex);

    if (fromDom !== null) {
      return fromDom;
    }

    const designEnd = rewardFlySlotCenterDesign(hudLayout, slotIndex);
    const viaHud = resolveSlotCenterViaHudRoot(
      host,
      designSize.width,
      designSize.height,
      designEnd.x,
      designEnd.y,
    );

    if (viaHud !== null) {
      return viaHud;
    }

    const rect = host.getBoundingClientRect();
    const fitted = fitDesignToHost(
      Math.max(1, rect.width),
      Math.max(1, rect.height),
      designSize.width,
      designSize.height,
      1,
    );

    return designPointToHostLocal(
      designEnd.x,
      designEnd.y,
      fitted.offsetX,
      fitted.offsetY,
      fitted.scale > 0 ? fitted.scale : 1,
    );
  };

  useEffect(() => {
    const host = hostRef.current;

    if (host === null) {
      return;
    }

    /**
     * @param w - 宽
     * @param h - 高
     */
    const applySize = (w: number, h: number): void => {
      setHostSize((prev) =>
        prev.w === w && prev.h === h ? prev : { w, h },
      );
    };

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry === undefined) {
        return;
      }

      applySize(entry.contentRect.width, entry.contentRect.height);
    });

    ro.observe(host);
    const rect = host.getBoundingClientRect();

    applySize(rect.width, rect.height);

    return () => ro.disconnect();
  }, [current?.id]);

  useEffect(() => {
    if (current === null) {
      setFlyEnd(null);
      setPhase("appear");

      return;
    }

    setPhase("appear");
    setFlyEnd(null);

    const holdTimer = window.setTimeout(() => {
      setPhase("hold");
    }, APPEAR_MS);

    const flyTimer = window.setTimeout(() => {
      const el = hostRef.current;

      if (el !== null) {
        setFlyEnd(resolveFlyEnd(el, current.itemId, current.slotIndex));
      }

      setPhase("fly");
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
  }, [
    current?.id,
    current?.itemId,
    current?.slotIndex,
    designSize.height,
    designSize.width,
    hudLayout,
    onAdvance,
  ]);

  const flying = phase === "fly" || phase === "done";
  const iconPos =
    flying && flyEnd !== null
      ? flyEnd
      : appearPos;

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

  const size = flying ? slotSize : centerSize;
  const opacity = phase === "done" ? 0 : 1;
  const popScale =
    phase === "appear" ? 0.5 : phase === "hold" ? 1 : flying ? 0.55 : 1;
  const glowSize = Math.round(centerSize * 2.15);
  const raySize = Math.round(centerSize * 1.52);
  /** 宿主尚未测到时不渲染实体，避免闪在 (0,0) */
  const layoutReady = hostSize.w > 1 && hostSize.h > 1;

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

      {layoutReady ? (
        <div
          key={current.id}
          style={{
            position: "absolute",
            left: iconPos.x,
            top: iconPos.y,
            width: 0,
            height: 0,
            transform: "translate(-50%, -50%)",
            transition: flying
              ? `left ${FLY_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), top ${FLY_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
              : "none",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: glowSize,
              height: glowSize,
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
                width: raySize,
                height: raySize,
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

          <div
            data-testid="reward-fly-icon"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: size,
              height: size,
              transform: `translate(-50%, -50%) scale(${popScale})`,
              opacity,
              transition: flying
                ? `width ${FLY_MS}ms ease, height ${FLY_MS}ms ease, transform ${FLY_MS}ms ease, opacity ${FLY_MS}ms ease`
                : `transform ${APPEAR_MS}ms cubic-bezier(0.2, 1.4, 0.3, 1), opacity ${APPEAR_MS}ms ease`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              padding: flying ? 2 : Math.max(6, Math.round(10 * layoutScale)),
              borderRadius: flying
                ? Math.max(4, Math.round(8 * layoutScale))
                : Math.max(10, Math.round(20 * layoutScale)),
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
                  fontSize: Math.max(11, Math.round(13 * layoutScale)),
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
      ) : null}
    </div>
  );
}
