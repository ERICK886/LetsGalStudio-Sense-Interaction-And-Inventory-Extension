/**
 * inventory-quickbar.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.1
 *
 * 运行时 8 格快捷栏：按最近获得截断，定位取自 InventoryHudConfig；
 * 点击槽打开大图，打开背包进入完整网格（含合成 Tab 接线）。
 * @deprecated 玩家快捷栏已迁至 `backpack/` + `backpack-hud` 模块；
 * 本文件仅保留 InventoryQuickbar / InventoryHudLayer 作兼容参考，勿再挂到场景壳。
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  useExtensionContext,
  type SaveAPI,
} from "@avg-studio/sdk";
import {
  getQuickbarEntries,
  QUICKBAR_SLOTS,
} from "../domain/inventory";
import { craftRecipeInInventory } from "../domain/crafting";
import { findItem } from "../domain/item-registry";
import { findRecipe } from "../domain/recipe-registry";
import { resolveHudLayout } from "../domain/hud-layout";
import { parseInventoryHudJson } from "../domain/serialize";
import type {
  InventoryEntry,
  InventoryHudConfig,
  InventoryState,
  ItemDefinition,
  RecipeDefinition,
} from "../domain/types";
import { resolveAssetUrl } from "../shared/resolve-asset-url";
import { useInventory } from "../store/inventory-persistence";
import { useItemsLibrary } from "../store/items-persistence";
import { useRecipesLibrary } from "../store/recipes-persistence";
import { readRuntimeSetting } from "../store/runtime-settings";
import type { SceneInteractionSaveMap } from "../store/save-types";
import {
  FONT_SIZE_DEFAULT,
  useTheme,
} from "../theme/theme-provider";
import { InventoryBackpack } from "./inventory-backpack";
import { ItemDetailModal } from "./item-detail-modal";

/**
 * InventoryQuickbar 组件属性。
 */
export interface InventoryQuickbarProps {
  /** 当前库存 */
  inventory: InventoryState;

  /** 物品库定义 */
  items: readonly ItemDefinition[];

  /** HUD 外观与定位 */
  hud: InventoryHudConfig;

  /**
   * 可选配方列表；传入后背包显示「合成」Tab。
   * 未提供时由 InventoryBackpack 尝试 CraftBagContext。
   */
  recipes?: readonly RecipeDefinition[];

  /**
   * 可选合成回调；与 recipes 配套使用。
   *
   * @param recipeId - 配方 id
   */
  onCraftRecipe?: (recipeId: string) => void;
}

/**
 * 快捷栏槽位稳定 key；空槽用 index。
 *
 * @param entry - 库存条目或 null
 * @param index - 槽位下标 0..7
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
 * 将 quickbar 条目补齐到 QUICKBAR_SLOTS 格（空位为 null）。
 *
 * @param entries - getQuickbarEntries 结果（最多 8）
 * @returns 长度固定为 QUICKBAR_SLOTS 的数组
 */
function padQuickbarSlots(
  entries: InventoryEntry[],
): Array<InventoryEntry | null> {
  const slots: Array<InventoryEntry | null> = entries.slice(0, QUICKBAR_SLOTS);

  while (slots.length < QUICKBAR_SLOTS) {
    slots.push(null);
  }

  return slots;
}

/**
 * 8 格快捷栏 + 打开背包 + 大图 / 背包弹层。
 *
 * 定位 / 槽尺寸 / 间距取自 `resolveHudLayout(hud)`。
 * 默认纵向排列（左侧锚点）。
 *
 * @param props.inventory - 库存状态
 * @param props.items - 物品库
 * @param props.hud - InventoryHudConfig
 * @returns 绝对定位快捷栏 UI（含弹层）
 *
 * @example
 * ```tsx
 * <InventoryQuickbar
 *   inventory={inventory}
 *   items={items}
 *   hud={parseInventoryHudJson(json)}
 * />
 * ```
 */
export function InventoryQuickbar({
  inventory,
  items,
  hud,
  recipes,
  onCraftRecipe,
}: InventoryQuickbarProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const resolve = ctx.asset?.resolve?.bind(ctx.asset);
  const [bagOpen, setBagOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<ItemDefinition | null>(null);

  const slots = useMemo(
    () => padQuickbarSlots(getQuickbarEntries(inventory)),
    [inventory],
  );

  const itemList = items as ItemDefinition[];

  /**
   * 共享布局解析：与 backpack-shell / 编辑器画布同源，避免定位漂移。
   */
  const layout = useMemo(() => resolveHudLayout(hud), [hud]);
  const slotSize = Math.max(24, layout.root.slotSize || 64);
  const gap = Math.max(0, layout.root.gap || 0);
  const openBagLabel = layout.openBagStyle.label || "打开背包";

  /**
   * HUD 强调色：作者配置优先，空串回退主题 accent。
   */
  const accent =
    typeof layout.accent === "string" && layout.accent.trim().length > 0
      ? layout.accent.trim()
      : tokens.accent;

  /**
   * 点击非空槽：打开物品大图。
   *
   * @param entry - 槽内条目
   */
  const handleSlotClick = (entry: InventoryEntry): void => {
    const def = findItem(itemList, entry.itemId);

    if (def === undefined) {
      console.warn(
        "[scene-interaction]",
        "quickbar: missing item definition",
        entry.itemId,
      );

      return;
    }

    setDetailItem(def);
  };

  return (
    <>
      {layout.customCss.trim() ? (
        <style data-testid="inventory-hud-custom-css">{layout.customCss}</style>
      ) : null}

      <div
        className="inventory-hud-root"
        data-testid="inventory-quickbar"
        style={{
          position: "absolute",
          left: layout.root.x,
          top: layout.root.y,
          zIndex: 40,
          display: "flex",
          flexDirection: layout.root.direction,
          alignItems: "stretch",
          gap,
          pointerEvents: "auto",
        }}
      >
        {slots.map((entry, index) => {
          const def =
            entry !== null ? findItem(itemList, entry.itemId) : undefined;
          const iconRaw = def?.icon?.trim() || "";
          const icon = iconRaw
            ? resolveAssetUrl(iconRaw, resolve)
            : "";
          const name = def?.name || entry?.itemId || "";
          const count =
            entry?.kind === "stack" && entry.count > 1
              ? String(entry.count)
              : null;

          return (
            <button
              key={slotKey(entry, index)}
              type="button"
              data-testid="inventory-quickbar-slot"
              data-slot-index={index}
              data-item-id={entry?.itemId ?? ""}
              disabled={entry === null}
              title={entry === null ? "空槽" : name}
              onClick={() => {
                if (entry !== null) {
                  handleSlotClick(entry);
                }
              }}
              style={{
                appearance: "none",
                position: "relative",
                width: slotSize,
                height: slotSize,
                padding: 4,
                borderRadius: 8,
                border: `1px solid ${tokens.borderStrong}`,
                background:
                  entry === null ? `${tokens.bgSunken}99` : tokens.bgElevated,
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

              {count !== null ? (
                <span
                  style={{
                    position: "absolute",
                    right: 3,
                    bottom: 1,
                    fontSize: 11,
                    fontWeight: 700,
                    color: tokens.textPrimary,
                    textShadow: "0 1px 2px rgba(0,0,0,0.85)",
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
          data-testid="inventory-quickbar-open-bag"
          onClick={() => setBagOpen(true)}
          style={{
            appearance: "none",
            width: slotSize,
            minHeight: 32,
            padding: "6px 4px",
            borderRadius: 8,
            border: `1px solid ${accent}`,
            background: `${accent}22`,
            color: tokens.textPrimary,
            fontSize: Math.max(11, FONT_SIZE_DEFAULT - 1),
            fontFamily: "inherit",
            fontWeight: 600,
            cursor: "pointer",
            lineHeight: 1.2,
          }}
        >
          {openBagLabel}
        </button>
      </div>

      {bagOpen ? (
        <InventoryBackpack
          inventory={inventory}
          items={items}
          recipes={recipes}
          onCraftRecipe={onCraftRecipe}
          onClose={() => setBagOpen(false)}
        />
      ) : null}

      <ItemDetailModal
        item={detailItem}
        onClose={() => setDetailItem(null)}
      />
    </>
  );
}

/**
 * InventoryHudLayer 属性：自订阅存档与 settings。
 */
export interface InventoryHudLayerProps {
  /**
   * 强类型存档 API（读 inventoryJson）。
   */
  save: SaveAPI<SceneInteractionSaveMap>;
}

/**
 * 自包含 HUD 层：订阅 inventory / items / recipes / inventoryHudJson 并渲染快捷栏。
 *
 * 用于 `inventoryHudMode === "always"` 时挂在 App 运行态（壳外无 CraftBagContext，
 * 本层直接接线合成）；或 `withScene` 时挂在 RuntimeShell 内（props 优先于 Context）。
 *
 * @param props.save - 存档 API
 * @returns InventoryQuickbar
 *
 * @example
 * ```tsx
 * {!isEditing && hudMode === "always" ? (
 *   <InventoryHudLayer save={save} />
 * ) : null}
 * ```
 */
export function InventoryHudLayer({
  save,
}: InventoryHudLayerProps): React.ReactElement {
  const ctx = useExtensionContext();
  const [inventory, setInventory] = useInventory(save, ctx);
  const [itemsLibrary] = useItemsLibrary();
  const [recipesLibrary] = useRecipesLibrary();
  /**
   * HUD JSON：本模块 settings.useValue；编辑器预览则 cross 读 scene-interaction。
   */
  const [hudJsonLocal] = ctx.settings.useValue("inventoryHudJson");

  /** 最新库存 / 库引用，供合成闭包读取 */
  const inventoryRef = useRef<InventoryState>(inventory);
  const itemsRef = useRef<ItemDefinition[]>(itemsLibrary.items);
  const recipesRef = useRef<RecipeDefinition[]>(recipesLibrary.recipes);

  inventoryRef.current = inventory;
  itemsRef.current = itemsLibrary.items;
  recipesRef.current = recipesLibrary.recipes;

  /**
   * 背包合成：findRecipe → craftRecipeInInventory → 成功则写回 inventory。
   *
   * @param recipeId - 配方 id
   */
  const handleCraftRecipe = useCallback(
    (recipeId: string): void => {
      const recipe = findRecipe(recipesRef.current, recipeId);

      if (recipe === undefined) {
        console.warn(
          "[scene-interaction]",
          "craft: recipe not found",
          recipeId,
        );

        return;
      }

      const result = craftRecipeInInventory(
        inventoryRef.current,
        recipe,
        itemsRef.current,
        Date.now(),
      );

      if (!result.ok) {
        console.warn(
          "[scene-interaction]",
          "craft: failed",
          recipeId,
          result.reason,
        );

        return;
      }

      setInventory(result.state);
    },
    [setInventory],
  );

  const hud = useMemo((): InventoryHudConfig => {
    let raw = "";

    if (typeof hudJsonLocal === "string" && hudJsonLocal.length > 0) {
      raw = hudJsonLocal;
    } else {
      const cross = readRuntimeSetting(ctx, "inventoryHudJson");

      raw = typeof cross === "string" ? cross : String(cross ?? "");
    }

    return parseInventoryHudJson(raw);
  }, [hudJsonLocal, ctx]);

  return (
    <InventoryQuickbar
      inventory={inventory}
      items={itemsLibrary.items}
      hud={hud}
      recipes={recipesLibrary.recipes}
      onCraftRecipe={handleCraftRecipe}
    />
  );
}
