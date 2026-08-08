/**
 * backpack-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.9
 *
 * backpack-hud 主壳：常驻快捷栏 HUD + 可选全屏背包。
 * 根节点 pointer-events:none，仅交互控件接收事件，避免挡住场景。
 * 全屏背包的入场 / 退场动画由 BackpackScreen 内部处理，退场后再卸载。
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import { craftRecipeInInventory } from "../domain/crafting";
import {
  getQuickbarEntries,
  QUICKBAR_SLOTS,
} from "../domain/inventory";
import { findItem } from "../domain/item-registry";
import { findRecipe } from "../domain/recipe-registry";
import {
  hudLegacyLeft,
  hudLegacyTop,
} from "../domain/inventory-hud";
import { parseInventoryHudJson } from "../domain/serialize";
import type {
  InventoryEntry,
  InventoryState,
  ItemDefinition,
  RecipeDefinition,
} from "../domain/types";
import { ItemDetailModal } from "../runtime/item-detail-modal";
import { resolveAssetUrl } from "../shared/resolve-asset-url";
import { subscribeOpenBackpack } from "../store/backpack-ui-session";
import {
  INVENTORY_HUD_JSON_KEY,
  readHudSetting,
} from "../store/hud-settings";
import { useInventorySession } from "../store/inventory-session";
import { useItemsLibrary } from "../store/items-persistence";
import { useRecipesLibrary } from "../store/recipes-persistence";
import { subscribeSettingsField } from "../store/settings-sync";
import {
  FONT_SIZE_DEFAULT,
  useTheme,
} from "../theme/theme-provider";
import { BackpackScreen } from "./backpack-screen";

/**
 * BackpackShell 属性。
 */
export interface BackpackShellProps {
  /**
   * 初始是否打开全屏背包（可由 ui.show props 注入）。
   */
  openBackpack?: boolean;
}

/**
 * @param entry - 槽位条目
 * @param index - 下标
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
 * @param entries - 快捷栏条目
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
 * 背包 HUD 壳：快捷栏 + 全屏背包。
 *
 * @param props.openBackpack - 是否默认打开全屏
 * @returns 透明全屏层
 */
export function BackpackShell({
  openBackpack: openBackpackProp = false,
}: BackpackShellProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const resolve = ctx.asset?.resolve?.bind(ctx.asset);

  const [inventory, setInventory] = useInventorySession();
  const [itemsLibrary] = useItemsLibrary();
  const [recipesLibrary] = useRecipesLibrary();

  const [bagOpen, setBagOpen] = useState(Boolean(openBackpackProp));
  const [detailItem, setDetailItem] = useState<ItemDefinition | null>(null);

  /**
   * 本模块 settings.useValue + 编辑器 cross 写入后的进程内通知，保证外观热更新。
   */
  const [hudJsonLocal] = ctx.settings.useValue(INVENTORY_HUD_JSON_KEY);
  const [hudTick, setHudTick] = useState(0);

  const inventoryRef = useRef<InventoryState>(inventory);
  const itemsRef = useRef<ItemDefinition[]>(itemsLibrary.items);
  const recipesRef = useRef<RecipeDefinition[]>(recipesLibrary.recipes);

  inventoryRef.current = inventory;
  itemsRef.current = itemsLibrary.items;
  recipesRef.current = recipesLibrary.recipes;

  useEffect(() => {
    if (openBackpackProp) {
      setBagOpen(true);
    }
  }, [openBackpackProp]);

  useEffect(() => subscribeOpenBackpack(() => setBagOpen(true)), []);

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

  const handleCraftRecipe = useCallback(
    (recipeId: string): void => {
      const recipe = findRecipe(recipesRef.current, recipeId);

      if (recipe === undefined) {
        return;
      }

      const result = craftRecipeInInventory(
        inventoryRef.current,
        recipe,
        itemsRef.current,
        Date.now(),
      );

      if (result.ok) {
        setInventory(result.state);
      }
    },
    [setInventory],
  );

  const slotSize =
    hud.nodes.quickbarRoot.slotSize > 0
      ? hud.nodes.quickbarRoot.slotSize
      : 56;
  const gap =
    hud.nodes.quickbarRoot.gap >= 0 ? hud.nodes.quickbarRoot.gap : 8;
  const openBagLabel =
    hud.nodes.openBagButton.style.label || "打开背包";

  /**
   * HUD 强调色：作者配置优先，非法 / 空串回退主题 accent。
   */
  const accent =
    typeof hud.accent === "string" && hud.accent.trim().length > 0
      ? hud.accent.trim()
      : tokens.accent;

  return (
    <div
      data-testid="backpack-shell"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 80,
      }}
    >
      {/* 快捷栏 HUD */}
      <div
        data-testid="backpack-quickbar"
        style={{
          position: "absolute",
          left: hudLegacyLeft(hud),
          top: hudLegacyTop(hud),
          zIndex: 81,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap,
          pointerEvents: "auto",
        }}
      >
        {slots.map((entry, index) => {
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
              disabled={entry === null}
              title={entry === null ? "空槽" : name}
              onClick={() => {
                if (entry !== null && def) {
                  setDetailItem(def);
                }
              }}
              style={{
                appearance: "none",
                position: "relative",
                width: slotSize,
                height: slotSize,
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
                    background: accent,
                    color: "#0B1210",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}

        <button
          type="button"
          data-testid="backpack-open-button"
          onClick={() => setBagOpen(true)}
          style={{
            appearance: "none",
            border: `1px solid ${accent}`,
            background: accent,
            color: "#0B1210",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: FONT_SIZE_DEFAULT,
            fontFamily: "inherit",
            fontWeight: 650,
            cursor: "pointer",
            marginTop: 4,
          }}
        >
          {openBagLabel}
        </button>
      </div>

      {bagOpen ? (
        <BackpackScreen
          inventory={inventory}
          items={itemsLibrary.items}
          recipes={recipesLibrary.recipes}
          onCraftRecipe={handleCraftRecipe}
          onClose={() => setBagOpen(false)}
        />
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
