/**
 * hud-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.3.0
 *
 * 快捷栏 HUD 壳（不含全屏背包）：槽位 + 「打开背包」按钮组件（overlay role）。
 * - compactHost：坐标相对 ui.show 紧凑包围盒原点
 * - 非 compact：与 SceneView 一致做 letterbox（fitDesignToHost），设计坐标落在缩放舞台上
 * 根 pointer-events:none，仅槽位/按钮 auto。「打开背包」→ ui.show(`backpack`)。
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  getQuickbarEntries,
  QUICKBAR_SLOTS,
} from "../domain/inventory";
import { findItem } from "../domain/item-registry";
import {
  computeHudAxisAlignedBounds,
  resolveHudLayout,
} from "../domain/hud-layout";
import { HUD_CHROME_OVERLAY_IDS } from "../domain/inventory-hud";
import { layerZIndex } from "../domain/layer-order";
import { parseInventoryHudJson } from "../domain/serialize";
import { useDesignSize } from "../store/use-design-size";
import {
  applyUiBoxStyle,
  applyUiTextStyle,
} from "../domain/ui-style";
import type {
  InventoryEntry,
  ItemDefinition,
  UiOverlayElement,
  UiOverlayRole,
} from "../domain/types";
import { ItemDetailModal } from "../runtime/item-detail-modal";
import { UiOverlayLayer } from "../runtime/ui-overlay-layer";
import {
  BACKPACK_HUD_MODULE_ID,
  BACKPACK_MODULE_ID,
} from "../shared/module-ids";
import { logError } from "../shared/logger";
import { resolveAssetUrl } from "../shared/resolve-asset-url";
import { createContextAssetResolver } from "../shared/resolve-context-asset-url";
import { fitDesignToHost } from "../shared/scene-layout";
import {
  INVENTORY_HUD_JSON_KEY,
  readHudSetting,
} from "../store/hud-settings";
import {
  BACKPACK_HUD_FULLSCREEN_SHOW_OPTIONS,
  getTightBackpackHudShowOptions,
} from "../store/hud-ui-show";
import { useInventorySession } from "../store/inventory-session";
import { useItemsLibrary } from "../store/items-persistence";
import { readSceneHudVisibility, sceneHudVisibility, subscribeSceneHudVisibility } from "../store/scene-hud-visibility";
import type { SceneDefinition } from "../domain/types";
import { subscribeSettingsField } from "../store/settings-sync";
import { useTheme } from "../theme/theme-provider";

/**
 * HudShell 属性。
 */
export interface HudShellProps {
  /**
   * 紧凑宿主：坐标相对 HUD 包围盒；打开物品详情时临时全屏宿主。
   * false 时在全屏宿主内按设计分辨率 letterbox（预览 / 推荐玩家路径）。
   * @default true（经 backpack-hud ui.show 打开时）
   */
  compactHost?: boolean;
  /** 预览直接传当前场景，避免读取玩家存档。 */
  scene?: SceneDefinition | null;
}

/**
 * 槽位稳定 React key。
 *
 * @param entry - 槽位条目
 * @param index - 下标
 * @returns React key
 */
function slotKey(entry: InventoryEntry | null, index: number): string {
  if (entry === null) {
    return `empty:${index}`;
  }

  if (entry.kind === "unique") {
    return `unique:${entry.instanceId}`;
  }

  return `stack:${entry.itemId}`;
}

/**
 * 将快捷栏条目补齐到固定格数。
 *
 * @param entries - getQuickbarEntries 结果
 * @returns 长度固定为 QUICKBAR_SLOTS
 */
function padSlots(
  entries: InventoryEntry[],
): Array<InventoryEntry | null> {
  const slots: Array<InventoryEntry | null> = entries.slice(
    0,
    QUICKBAR_SLOTS,
  );

  while (slots.length < QUICKBAR_SLOTS) {
    slots.push(null);
  }

  return slots;
}

/**
 * 快捷栏 HUD 壳。
 *
 * @param props.compactHost - 是否紧凑宿主坐标
 * @returns HUD 层
 *
 * @example
 * ```tsx
 * <HudShell compactHost />
 * ```
 */
export function HudShell({
  compactHost = true,
  scene,
}: HudShellProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const resolve = createContextAssetResolver(ctx);

  const [inventory] = useInventorySession();
  const [itemsLibrary] = useItemsLibrary();
  const [detailItem, setDetailItem] = useState<ItemDefinition | null>(null);

  const { size: designSize } = useDesignSize();
  const [hudJsonLocal] = ctx.settings.useValue(INVENTORY_HUD_JSON_KEY);
  const [hudTick, setHudTick] = useState(0);
  const [sceneVisibility, setSceneVisibility] = useState(() => readSceneHudVisibility(ctx));
  useEffect(() => subscribeSceneHudVisibility(() => {
    setSceneVisibility(readSceneHudVisibility(ctx));
  }), [ctx]);
  const visibility = scene === undefined ? sceneVisibility : sceneHudVisibility(scene);

  useEffect(() => {
    return subscribeSettingsField((key) => {
      if (key === INVENTORY_HUD_JSON_KEY) {
        setHudTick((n) => n + 1);
      }
    });
  }, []);

  const hud = useMemo(() => {
    let raw = "";

    if (typeof hudJsonLocal === "string" && hudJsonLocal.trim().length > 0) {
      raw = hudJsonLocal;
    } else {
      const fromStore = readHudSetting(ctx, INVENTORY_HUD_JSON_KEY);

      raw =
        typeof fromStore === "string" ? fromStore : String(fromStore ?? "");
    }

    return parseInventoryHudJson(
      raw,
      designSize.width,
      designSize.height,
    );
  }, [ctx, designSize.height, designSize.width, hudJsonLocal, hudTick]);

  const slots = useMemo(
    () => padSlots(getQuickbarEntries(inventory)),
    [inventory],
  );

  const layout = useMemo(() => resolveHudLayout(hud), [hud]);

  const openBagOverlayRect = useMemo(() => {
    const el = (hud.overlays ?? []).find(
      (o) =>
        o.id === HUD_CHROME_OVERLAY_IDS.openBag || o.role === "openBag",
    );

    if (!el) {
      return undefined;
    }

    return {
      x: el.rect.x,
      y: el.rect.y,
      w: el.rect.w ?? layout.openBagButton.w,
      h: el.rect.h ?? layout.openBagButton.h,
    };
  }, [hud.overlays, layout.openBagButton.h, layout.openBagButton.w]);

  const hudBounds = useMemo(
    () => computeHudAxisAlignedBounds(layout, 8, openBagOverlayRect),
    [layout, openBagOverlayRect],
  );

  const useCompactCoords = compactHost && detailItem === null;
  const originX = useCompactCoords ? hudBounds.x : 0;
  const originY = useCompactCoords ? hudBounds.y : 0;

  const hostRef = useRef<HTMLDivElement>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });

  /**
   * 非紧凑模式：测量宿主，与 SceneView / 返回钮共用 letterbox。
   */
  useEffect(() => {
    if (useCompactCoords) {
      return;
    }

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
  }, [useCompactCoords]);

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

  /**
   * 非紧凑：与 SceneReturnButton 相同，用 offset+design×scale 写宿主 CSS 像素，
   * 避免编辑器预览里嵌套 `transform: scale` 失效导致 HUD 贴顶/错位。
   */
  const layoutScale = useCompactCoords
    ? 1
    : world.scale > 0
      ? world.scale
      : 0.001;
  const screenOffsetX = useCompactCoords ? 0 : world.offsetX;
  const screenOffsetY = useCompactCoords ? 0 : world.offsetY;
  const layoutReady = useCompactCoords || (hostSize.w > 0 && hostSize.h > 0);

  /**
   * 物品详情需要全屏层；关闭后收束回 HUD 包围盒（仅 compactHost）。
   */
  useEffect(() => {
    if (!compactHost) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        /**
         * 系统设置等遮挡界面打开时禁止再 show，避免 HUD 被重新叠到最前。
         */
        const { isHudForeignCovered } = await import(
          "../runtime/hud-foreign-cover"
        );

        if (isHudForeignCovered()) {
          return;
        }

        if (detailItem !== null) {
          await ctx.ui.show(
            BACKPACK_HUD_MODULE_ID,
            { compactHost: true },
            { ...BACKPACK_HUD_FULLSCREEN_SHOW_OPTIONS },
          );
        } else {
          await ctx.ui.show(
            BACKPACK_HUD_MODULE_ID,
            { compactHost: true },
            getTightBackpackHudShowOptions(ctx),
          );
        }
      } catch {
        if (!cancelled) {
          // 忽略
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    compactHost,
    detailItem,
    ctx,
    hudBounds.x,
    hudBounds.y,
    hudBounds.w,
    hudBounds.h,
  ]);

  /**
   * 打开独立全屏背包程序。
   */
  const handleOpenBackpack = useCallback((): void => {
    void (async () => {
      try {
        await ctx.ui.show(
          BACKPACK_MODULE_ID,
          {},
          { ...BACKPACK_HUD_FULLSCREEN_SHOW_OPTIONS },
        );
      } catch (err) {
        logError("hud-shell", "打开全屏背包程序失败", err);
      }
    })();
  }, [ctx]);

  const accent =
    typeof layout.accent === "string" && layout.accent.trim().length > 0
      ? layout.accent.trim()
      : tokens.accent;

  const slotBoxCss = applyUiBoxStyle(layout.slotStyle);
  const badgeBoxCss = applyUiBoxStyle(layout.badgeStyle);
  const badgeTextCss = applyUiTextStyle(layout.badgeStyle);
  const badgeBackground =
    layout.badgeStyle.background !== undefined &&
    layout.badgeStyle.background.trim().length > 0
      ? layout.badgeStyle.background
      : accent;

  /**
   * overlay 按钮角色动作：打开全屏背包。
   *
   * @param role - 图层角色
   */
  const handleOverlayAction = useCallback(
    (role: UiOverlayRole, _el: UiOverlayElement): void => {
      if (role === "openBag") {
        handleOpenBackpack();
      }
    },
    [handleOpenBackpack],
  );

  return (
    <div
      ref={hostRef}
      data-testid="hud-shell"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 80,
      }}
    >
      {layout.customCss.trim() ? (
        <style data-testid="backpack-hud-custom-css">{layout.customCss}</style>
      ) : null}

      {layoutReady ? (
        <div
          data-testid="backpack-quickbar"
          className="inventory-hud-root"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 81,
            pointerEvents: "none",
          }}
        >
          {visibility.showQuickbar ? slots.map((entry, index) => {
            const rect = layout.slots[index] ?? {
              x: layout.root.x,
              y:
                layout.root.y +
                index * (layout.root.slotSize + layout.root.gap),
              w: layout.root.slotSize,
              h: layout.root.slotSize,
            };
            const def =
              entry !== null
                ? findItem(itemsLibrary.items, entry.itemId)
                : undefined;
            const icon = resolveAssetUrl(def?.icon?.trim() || "", resolve);
            const name = def?.name || entry?.itemId || "";
            const count =
              entry?.kind === "stack" && entry.count > 1
                ? String(entry.count)
                : null;

            return (
              <button
                key={slotKey(entry, index)}
                type="button"
                data-testid="backpack-quickbar-slot"
                data-slot-index={index}
                data-item-id={entry?.itemId ?? ""}
                disabled={entry === null}
                title={entry === null ? "空槽" : name}
                onClick={() => {
                  if (entry !== null && def) {
                    setDetailItem(def);
                  }
                }}
                style={{
                  appearance: "none",
                  position: "absolute",
                  left:
                    screenOffsetX + (rect.x - originX) * layoutScale,
                  top:
                    screenOffsetY + (rect.y - originY) * layoutScale,
                  width: rect.w * layoutScale,
                  height: rect.h * layoutScale,
                  zIndex: layerZIndex(hud.layerOrder, "quickbarRoot", 0),
                  boxSizing: "border-box",
                  padding: Math.max(2, Math.round(4 * layoutScale)),
                  borderRadius: Math.max(2, Math.round(8 * layoutScale)),
                  border:
                    entry === null
                      ? `1px solid ${tokens.borderStrong}`
                      : `1px solid ${accent}59`,
                  background:
                    entry === null
                      ? `${tokens.bgSunken}99`
                      : tokens.bgElevated,
                  cursor: entry === null ? "default" : "pointer",
                  opacity: entry === null ? 0.55 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  boxShadow:
                    entry === null
                      ? "none"
                      : "0 2px 8px rgba(0,0,0,0.35)",
                  pointerEvents: entry === null ? "none" : "auto",
                  ...slotBoxCss,
                  ...(entry === null ? { opacity: 0.55 } : null),
                }}
              >
                {entry !== null && icon ? (
                  <img
                    src={icon}
                    alt={name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
                {entry !== null && !icon ? (
                  <span
                    style={{
                      fontSize: Math.max(8, Math.round(10 * layoutScale)),
                      color: tokens.textMuted,
                      wordBreak: "break-all",
                      lineHeight: 1.15,
                    }}
                  >
                    {name || "?"}
                  </span>
                ) : null}
                {count ? (
                  <span
                    style={{
                      position: "absolute",
                      right: Math.max(1, Math.round(2 * layoutScale)),
                      bottom: Math.max(1, Math.round(2 * layoutScale)),
                      minWidth: Math.max(12, Math.round(16 * layoutScale)),
                      padding: `0 ${Math.max(2, Math.round(3 * layoutScale))}px`,
                      borderRadius: Math.max(2, Math.round(4 * layoutScale)),
                      color: "#0B1210",
                      fontSize: Math.max(8, Math.round(10 * layoutScale)),
                      fontWeight: 700,
                      boxSizing: "border-box",
                      ...badgeBoxCss,
                      ...badgeTextCss,
                      backgroundColor: badgeBackground,
                    }}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          }) : null}

          <UiOverlayLayer
            overlays={(hud.overlays ?? []).filter((el) =>
              visibility.showOpenBagButton ||
              (el.id !== HUD_CHROME_OVERLAY_IDS.openBag && el.role !== "openBag")
            )}
            originX={originX}
            originY={originY}
            layoutScale={layoutScale}
            screenOffsetX={screenOffsetX}
            screenOffsetY={screenOffsetY}
            onOverlayAction={handleOverlayAction}
          />
        </div>
      ) : null}

      <div style={{ pointerEvents: detailItem ? "auto" : "none" }}>
        <ItemDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
        />
      </div>
    </div>
  );
}
