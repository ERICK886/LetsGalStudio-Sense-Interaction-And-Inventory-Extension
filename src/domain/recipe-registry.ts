/**
 * recipe-registry.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 配方库查找：按 id 或 name 在 RecipeDefinition 列表中检索定义。
 */
import type { RecipeDefinition } from "./types";

/**
 * 在配方列表中按 id 或 name 查找定义。
 *
 * 匹配顺序：先精确匹配 `id`，再精确匹配 `name`。
 * `idOrName` 会先 trim；空字符串返回 undefined。
 *
 * @param recipes - 配方定义只读数组（通常来自 RecipesLibraryFile.recipes）
 * @param idOrName - 目标配方 id 或显示名
 * @returns 匹配的 RecipeDefinition；未找到或 key 为空时 undefined
 *
 * @example
 * const recipe = findRecipe(library.recipes, "brew-potion");
 * // 或 findRecipe(library.recipes, "调制药水")
 *
 * @throws 无抛出
 */
export function findRecipe(
  recipes: readonly RecipeDefinition[],
  idOrName: string,
): RecipeDefinition | undefined {
  const key = idOrName.trim();

  if (!key) {
    return undefined;
  }

  return (
    recipes.find((r) => r.id === key) ??
    recipes.find((r) => r.name === key)
  );
}
