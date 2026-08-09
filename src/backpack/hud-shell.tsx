/**
 * hud-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.2.0
 *
 * 快捷栏 HUD 壳（不含全屏背包）：槽位 + 「打开背包」按钮组件（overlay role）。
 * 方案 1：ui.show 包围盒 + interactable:false；本壳根 pointer-events:none，
 * 仅槽位/按钮 auto。compactHost 时坐标相对包围盒原点。
 * 「打开背包」→ ui.show(`backpack`)。
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
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
import { subscribeSettingsField } from "../store/settings-sync";
import { useTheme } from "../theme/theme-provider";

/**
 * HudShell 属性。
 */
export interface HudShellProps {
  /**
   * 紧凑宿主：坐标相对 HUD 包围盒；打开物品详情时临时全屏宿主。
   * @default true（经 backpack-hud ui.show 打开时）
   */
  compactHost?: boolean;
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
}: HudShellProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const resolve = ctx.asset?.resolve?.bind(ctx.asset);

  const [inventory] = useInventorySession();
  const [itemsLibrary] = useItemsLibrary();
  const [detailItem, setDetailItem] = useState<ItemDefinition | null>(null);

  const [hudJsonLocal] = ctx.settings.useValue(INVENTORY_HUD_JSON_KEY);
  const [hudTick, setHudTick] = useState(0);

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

    return parseInventoryHudJson(raw);
  }, [ctx, hudJsonLocal, hudTick]);

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

  /**
   * 物品详情需要全屏层；关闭后收束回 HUD 包围盒。
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
        {slots.map((entry, index) => {
          const rect = layout.slots[index] ?? {
            x: layout.root.x,
            y: layout.root.y + index * (layout.root.slotSize + layout.root.gap),
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
                left: rect.x - originX,
                top: rect.y - originY,
                width: rect.w,
                height: rect.h,
                zIndex: layerZIndex(hud.layerOrder, "quickbarRoot", 0),
                boxSizing: "border-box",
                padding: 4,
                borderRadius: 8,
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
                  entry === null ? "none" : "0 2px 8px rgba(0,0,0,0.35)",
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
                    fontSize: 10,
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
                    right: 2,
                    bottom: 2,
                    minWidth: 16,
                    padding: "0 3px",
                    borderRadius: 4,
                    color: "#0B1210",
                    fontSize: 10,
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
        })}

        <UiOverlayLayer
          overlays={hud.overlays ?? []}
          originX={originX}
          originY={originY}
          onOverlayAction={handleOverlayAction}
        />
      </div>

      <div style={{ pointerEvents: detailItem ? "auto" : "none" }}>
        <ItemDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
        />
      </div>
    </div>
  );
}
