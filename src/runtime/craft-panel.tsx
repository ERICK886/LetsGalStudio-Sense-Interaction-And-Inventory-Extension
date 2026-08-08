/**
 * craft-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 背包「合成」分页：列出配方、原料摘要与合成按钮；
 * 另导出 CraftBagContext，供壳层在不改 quickbar 的情况下向背包注入配方接线。
 */

import React, { createContext, useContext } from "react";
import { canCraftRecipe } from "../domain/crafting";
import { findItem } from "../domain/item-registry";
import type {
  InventoryState,
  ItemDefinition,
  RecipeDefinition,
} from "../domain/types";
import {
  FONT_SIZE_DEFAULT,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";

/**
 * 壳层注入的合成能力：配方列表 + 点击合成回调。
 * 由 PlayerShell / RuntimeShell 提供；InventoryBackpack 消费。
 */
export interface CraftBagContextValue {
  /** 当前配方库列表 */
  recipes: readonly RecipeDefinition[];

  /**
   * 执行一次合成（壳层负责 findRecipe → craft → 写回 inventory）。
   *
   * @param recipeId - 配方 id
   */
  onCraftRecipe: (recipeId: string) => void;
}

/**
 * 背包合成 Context；无 Provider 时为 null（不显示合成 Tab）。
 */
export const CraftBagContext = createContext<CraftBagContextValue | null>(
  null,
);

/**
 * 读取壳层注入的合成接线（若有）。
 *
 * @returns Context 值或 null
 *
 * @example
 * const craft = useCraftBagContext();
 * if (craft) { ... }
 */
export function useCraftBagContext(): CraftBagContextValue | null {
  return useContext(CraftBagContext);
}

/**
 * CraftPanel 组件属性。
 */
export interface CraftPanelProps {
  /** 配方列表 */
  recipes: readonly RecipeDefinition[];

  /** 物品库（解析原料显示名） */
  items: readonly ItemDefinition[];

  /** 当前库存（判断 canCraft） */
  inventory: InventoryState;

  /**
   * 点击「合成」时回调。
   *
   * @param recipeId - 配方 id
   */
  onCraft: (recipeId: string) => void;
}

/**
 * 将配方原料格式化为可读摘要（物品名×数量，顿号分隔）。
 *
 * @param recipe - 配方定义
 * @param items - 物品库
 * @returns 如「草药×2、清水×1」；无原料时返回「（无原料）」
 *
 * @example
 * formatIngredientSummary(brewPotion, itemsLibrary.items);
 *
 * @throws 无抛出
 */
export function formatIngredientSummary(
  recipe: RecipeDefinition,
  items: readonly ItemDefinition[],
): string {
  const itemList = items as ItemDefinition[];

  if (recipe.ingredients.length === 0) {
    return "（无原料）";
  }

  return recipe.ingredients
    .map((line) => {
      const def = findItem(itemList, line.itemId);
      const name = def?.name?.trim() || line.itemId;

      return `${name}×${line.count}`;
    })
    .join("、");
}

/**
 * 合成按钮样式。
 *
 * @param tokens - 主题
 * @param disabled - 是否禁用
 * @returns CSSProperties
 */
function craftButtonStyle(
  tokens: ThemeTokens,
  disabled: boolean,
): React.CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${disabled ? tokens.border : tokens.accent}`,
    background: disabled ? tokens.bgSunken : `${tokens.accent}33`,
    color: tokens.textPrimary,
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    lineHeight: 1.2,
    opacity: disabled ? 0.65 : 1,
    flexShrink: 0,
  };
}

/**
 * 背包合成列表：每行显示配方名、原料摘要与「合成」按钮。
 *
 * 当 `!canCraftRecipe` 时按钮 disabled，旁注「原料不足」。
 * 点击可用按钮时调用 `onCraft(recipe.id)`。
 *
 * @param props.recipes - 配方列表
 * @param props.items - 物品库
 * @param props.inventory - 库存
 * @param props.onCraft - 合成回调
 * @returns 合成面板 UI
 *
 * @example
 * ```tsx
 * <CraftPanel
 *   recipes={recipesLibrary.recipes}
 *   items={itemsLibrary.items}
 *   inventory={inventory}
 *   onCraft={(id) => onCraftRecipe(id)}
 * />
 * ```
 *
 * @remarks
 * data-testid：`craft-panel` / `craft-row-{id}` / `craft-button-{id}`
 */
export function CraftPanel({
  recipes,
  items,
  inventory,
  onCraft,
}: CraftPanelProps): React.ReactElement {
  const { tokens } = useTheme();

  return (
    <div
      data-testid="craft-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {recipes.length === 0 ? (
        <div
          data-testid="craft-panel-empty"
          style={{
            padding: 32,
            textAlign: "center",
            color: tokens.textMuted,
            fontSize: FONT_SIZE_DEFAULT,
          }}
        >
          暂无配方
        </div>
      ) : (
        recipes.map((recipe) => {
          const canCraft = canCraftRecipe(inventory, recipe);
          const summary = formatIngredientSummary(recipe, items);

          return (
            <div
              key={recipe.id}
              data-testid={`craft-row-${recipe.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${tokens.border}`,
                background: tokens.bgSunken,
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontSize: FONT_SIZE_DEFAULT,
                    fontWeight: 600,
                    color: tokens.textPrimary,
                  }}
                >
                  {recipe.name || recipe.id}
                </span>
                <span
                  style={{
                    fontSize: Math.max(11, FONT_SIZE_DEFAULT - 1),
                    color: tokens.textMuted,
                    wordBreak: "break-word",
                  }}
                >
                  {summary}
                </span>
              </div>

              {!canCraft ? (
                <span
                  data-testid={`craft-insufficient-${recipe.id}`}
                  style={{
                    fontSize: Math.max(11, FONT_SIZE_DEFAULT - 1),
                    color: tokens.textMuted,
                    flexShrink: 0,
                  }}
                >
                  原料不足
                </span>
              ) : null}

              <button
                type="button"
                data-testid={`craft-button-${recipe.id}`}
                disabled={!canCraft}
                onClick={() => {
                  if (canCraft) {
                    onCraft(recipe.id);
                  }
                }}
                style={craftButtonStyle(tokens, !canCraft)}
              >
                合成
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
