/**
 * recipe-list-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 编辑器左栏：配方列表 CRUD（搜索 / 新建 / 删除 / 选中）。
 * 对齐 item-list-panel 精简版（无场景引用软警告）。
 */

import { Button, Input, chakra } from "@chakra-ui/react";
import React, { useCallback, useMemo, useState } from "react";
import { createId } from "../../domain/id";
import type { RecipeDefinition, RecipesLibraryFile } from "../../domain/types";
import { IconLabel } from "../../shared/fa-icon";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

/**
 * RecipeListPanel 组件属性。
 */
export interface RecipeListPanelProps {
  /** 当前配方库 */
  library: RecipesLibraryFile;

  /** 当前选中配方 ID；无选中时为 null */
  selectedRecipeId: string | null;

  /**
   * 选中配方。
   *
   * @param recipeId - 配方 id；取消选中传 null
   */
  onSelectRecipe: (recipeId: string | null) => void;

  /**
   * 配方库变更（由父级负责 history.push + 持久化）。
   *
   * @param next - 新配方库
   */
  onLibraryChange: (next: RecipesLibraryFile) => void;
}

/**
 * 创建空白默认配方定义。
 *
 * @returns 带新 id 的 RecipeDefinition（空原料 / 空产物）
 *
 * @example
 * ```ts
 * const recipe = createDefaultRecipe();
 * // { id: "recipe_…", name: "未命名配方", ingredients: [], products: [] }
 * ```
 */
export function createDefaultRecipe(): RecipeDefinition {
  return {
    id: createId("recipe"),
    name: "未命名配方",
    ingredients: [],
    products: [],
  };
}

/**
 * 工具栏小按钮样式。
 *
 * @param tokens - 主题 token
 * @param options.danger - 危险操作（删除）
 * @returns CSSProperties
 */
function toolButtonStyle(
  tokens: ThemeTokens,
  options: { danger?: boolean } = {},
): React.CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${options.danger ? "#C45C5C" : tokens.borderStrong}`,
    background: tokens.bgSunken,
    color: options.danger ? "#E8A0A0" : tokens.textPrimary,
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: 500,
    cursor: "pointer",
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

/**
 * 配方列表行样式。
 *
 * @param tokens - 主题 token
 * @param selected - 是否选中
 * @returns CSSProperties
 */
function rowStyle(
  tokens: ThemeTokens,
  selected: boolean,
): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    border: `1px solid ${selected ? tokens.accent : "transparent"}`,
    background: selected ? `${tokens.accent}18` : "transparent",
    color: tokens.textPrimary,
    cursor: "pointer",
    fontSize: FONT_SIZE_DEFAULT,
    textAlign: "left",
    width: "100%",
    boxSizing: "border-box",
  };
}

/**
 * 配方列表面板：搜索 / 新建 / 删除 / 选中。
 *
 * @param props - RecipeListPanelProps
 * @returns 左栏配方列表 UI
 *
 * @example
 * ```tsx
 * <RecipeListPanel
 *   library={recipesLibrary}
 *   selectedRecipeId={recipeId}
 *   onSelectRecipe={setRecipeId}
 *   onLibraryChange={commitRecipes}
 * />
 * ```
 */
export function RecipeListPanel({
  library,
  selectedRecipeId,
  onSelectRecipe,
  onLibraryChange,
}: RecipeListPanelProps): React.ReactElement {
  const { tokens } = useTheme();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return library.recipes;
    }

    return library.recipes.filter(
      (recipe) =>
        recipe.name.toLowerCase().includes(q) ||
        recipe.id.toLowerCase().includes(q) ||
        (recipe.description ?? "").toLowerCase().includes(q),
    );
  }, [library.recipes, query]);

  /**
   * 新建配方并选中。
   */
  const handleAdd = useCallback(() => {
    const recipe = createDefaultRecipe();
    const next: RecipesLibraryFile = {
      version: 1,
      recipes: [...library.recipes, recipe],
    };

    onLibraryChange(next);
    onSelectRecipe(recipe.id);
  }, [library.recipes, onLibraryChange, onSelectRecipe]);

  /**
   * 删除指定配方；若当前选中被删则选中剩余第一项。
   *
   * @param recipeId - 待删配方 id
   * @param event - 鼠标事件（阻止冒泡选中）
   */
  const handleDelete = useCallback(
    (recipeId: string, event: React.MouseEvent) => {
      event.stopPropagation();

      const nextRecipes = library.recipes.filter(
        (recipe) => recipe.id !== recipeId,
      );
      const next: RecipesLibraryFile = { version: 1, recipes: nextRecipes };

      onLibraryChange(next);

      if (selectedRecipeId === recipeId) {
        onSelectRecipe(nextRecipes[0]?.id ?? null);
      }
    },
    [library.recipes, onLibraryChange, onSelectRecipe, selectedRecipeId],
  );

  return (
    <chakra.div
      data-testid="recipe-list-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        background: tokens.bgElevated,
        color: tokens.textPrimary,
      }}
    >
      <chakra.div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
        }}
      >
        <chakra.span
          style={{
            flex: 1,
            fontSize: FONT_SIZE_TITLE,
            fontWeight: 650,
          }}
        >
          配方
        </chakra.span>
        <Button size="xs" variant="plain"
          type="button"
          data-testid="recipe-list-add"
          onClick={handleAdd}
          style={toolButtonStyle(tokens)}
        >
          <IconLabel icon="plus">新建</IconLabel>
        </Button>
      </chakra.div>

      <chakra.div style={{ padding: "8px 12px", flexShrink: 0 }}>
        <Input size="xs"
          data-testid="recipe-list-search"
          type="search"
          placeholder="搜索配方…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 8px",
            borderRadius: 6,
            border: `1px solid ${tokens.border}`,
            background: tokens.bgSunken,
            color: tokens.textPrimary,
            fontSize: FONT_SIZE_DEFAULT,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </chakra.div>

      <chakra.div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "4px 8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {filtered.length === 0 ? (
          <chakra.div
            style={{
              padding: 16,
              color: tokens.textMuted,
              fontSize: FONT_SIZE_DEFAULT,
              textAlign: "center",
            }}
          >
            {library.recipes.length === 0
              ? "暂无配方，点击「新建」"
              : "无匹配配方"}
          </chakra.div>
        ) : (
          filtered.map((recipe) => {
            const selected = recipe.id === selectedRecipeId;

            return (
              <chakra.div
                key={recipe.id}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <Button size="xs" variant="plain"
                  type="button"
                  data-testid={`recipe-list-item-${recipe.id}`}
                  aria-selected={selected}
                  onClick={() => onSelectRecipe(recipe.id)}
                  style={rowStyle(tokens, selected)}
                >
                  <IconLabel icon="flask" iconSize={11} />
                  <chakra.span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {recipe.name || "（未命名）"}
                  </chakra.span>
                </Button>
                <Button size="xs" variant="plain"
                  type="button"
                  data-testid={`recipe-list-delete-${recipe.id}`}
                  aria-label={`删除配方 ${recipe.name}`}
                  onClick={(e) => handleDelete(recipe.id, e)}
                  style={{
                    ...toolButtonStyle(tokens, { danger: true }),
                    padding: "6px 8px",
                    flexShrink: 0,
                  }}
                >
                  <IconLabel icon="trash" />
                </Button>
              </chakra.div>
            );
          })
        )}
      </chakra.div>
    </chakra.div>
  );
}
