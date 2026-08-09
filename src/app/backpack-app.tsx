/**
 * backpack-app.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 全屏背包程序根组件（与快捷栏 HUD 分离）。
 * 库存真源经 inventory-session；布局读 backpackScreenJson。
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ExtensionProps } from "@avg-studio/sdk";
import { useExtensionContext } from "@avg-studio/sdk";
import { craftRecipeInInventory } from "../domain/crafting";
import { findRecipe } from "../domain/recipe-registry";
import type {
  InventoryState,
  ItemDefinition,
  RecipeDefinition,
} from "../domain/types";
import { BackpackScreen } from "../backpack/backpack-screen";
import { BACKPACK_MODULE_ID } from "../shared/module-ids";
import { logError } from "../shared/logger";
import { readAuthorSetting } from "../store/author-settings";
import {
  bindInventoryPersistence,
  isInventoryPersistenceBound,
  useInventorySession,
} from "../store/inventory-session";
import { createSettingsPreviewSave } from "../store/preview-save";
import { useItemsLibrary } from "../store/items-persistence";
import { useRecipesLibrary } from "../store/recipes-persistence";
import { ThemeProvider } from "../theme/theme-provider";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  rootTypographyStyle,
} from "../theme/theme-provider";
import type { ThemeMode } from "../theme/tokens";

/**
 * BackpackApp props。
 */
export interface BackpackAppProps extends ExtensionProps {}

/**
 * @param props.message - 文案
 * @param props.themeMode - 主题
 */
function MountPlaceholder({
  message,
  themeMode,
}: {
  message: string;
  themeMode: ThemeMode;
}): React.ReactElement {
  const muted = themeMode === "dark" ? "#8B8B95" : "#8A8582";

  return (
    <div
      data-testid="backpack-app-mount-placeholder"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        color: muted,
        pointerEvents: "none",
        ...rootTypographyStyle,
        fontSize: FONT_SIZE_DEFAULT,
      }}
    >
      <span style={{ fontSize: FONT_SIZE_TITLE, opacity: 0.5 }}>
        {message}
      </span>
    </div>
  );
}

/**
 * 全屏背包内容（已绑定库存会话）。
 *
 * @returns BackpackScreen
 */
function BackpackAppBody(): React.ReactElement {
  const ctx = useExtensionContext();
  const [inventory, setInventory] = useInventorySession();
  const [itemsLibrary] = useItemsLibrary();
  const [recipesLibrary] = useRecipesLibrary();

  const inventoryRef = useRef<InventoryState>(inventory);
  const itemsRef = useRef<ItemDefinition[]>(itemsLibrary.items);
  const recipesRef = useRef<RecipeDefinition[]>(recipesLibrary.recipes);

  inventoryRef.current = inventory;
  itemsRef.current = itemsLibrary.items;
  recipesRef.current = recipesLibrary.recipes;

  const handleCraftRecipe = useCallback(
    (recipeId: string): boolean => {
      const recipe = findRecipe(recipesRef.current, recipeId);

      if (recipe === undefined) {
        return false;
      }

      const result = craftRecipeInInventory(
        inventoryRef.current,
        recipe,
        itemsRef.current,
        Date.now(),
      );

      if (result.ok) {
        setInventory(result.state);

        return true;
      }

      return false;
    },
    [setInventory],
  );

  /**
   * 关闭：隐藏本程序 UI。
   */
  const handleClose = useCallback((): void => {
    void (async () => {
      try {
        await ctx.ui.hide(BACKPACK_MODULE_ID);
      } catch (err) {
        logError("backpack-app", "关闭全屏背包失败", err);
      }
    })();
  }, [ctx]);

  return (
    <BackpackScreen
      inventory={inventory}
      items={itemsLibrary.items}
      recipes={recipesLibrary.recipes}
      onCraftRecipe={handleCraftRecipe}
      onClose={handleClose}
    />
  );
}

/**
 * 全屏背包程序根。
 *
 * @param _props - ExtensionProps
 * @returns 全屏背包 UI
 */
export function BackpackApp(
  _props: BackpackAppProps,
): React.ReactElement {
  const ctx = useExtensionContext();
  const themeRaw = readAuthorSetting(ctx, "theme");
  const themeMode: ThemeMode = themeRaw === "light" ? "light" : "dark";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isInventoryPersistenceBound()) {
      setReady(true);

      return;
    }

    /**
     * 独立打开背包时的预览壳；若局内已有权威 slot 会自动改绑过去。
     */
    const previewSave = createSettingsPreviewSave(ctx);
    const unbind = bindInventoryPersistence(previewSave, { preview: true });

    setReady(true);

    return unbind;
  }, [ctx]);

  return (
    <ThemeProvider initialMode={themeMode} rootBackground="transparent">
      <div
        data-testid="backpack-app-root"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          background: "transparent",
        }}
      >
        {!ready ? (
          <MountPlaceholder themeMode={themeMode} message="" />
        ) : (
          <BackpackAppBody />
        )}
      </div>
    </ThemeProvider>
  );
}
