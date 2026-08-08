# Task 9 Report: 背包合成 UI

**Status:** Done  
**Branch:** `feature/scene-interaction-v02`  
**Author:** 池水三两升  
**Date:** 2026-08-08

## Commit

- Hash: `0a45325`
- Message: `feat: craft panel tab in backpack for preview and player`
- Staged only:
  - `src/runtime/craft-panel.tsx`（新建）
  - `src/runtime/inventory-backpack.tsx`
  - `src/runtime/player-shell.tsx`
  - `src/runtime/runtime-shell.tsx`

## Implementation

### `CraftPanel`
- Props：`recipes` / `items` / `inventory` / `onCraft(recipeId)`
- 每行：配方名、原料摘要（物品名×数量）、「合成」按钮
- `!canCraftRecipe` → 按钮 disabled + 旁注「原料不足」
- data-testid：`craft-panel` / `craft-row-{id}` / `craft-button-{id}`

### `InventoryBackpack`
- `BagTab = "items" | "craft"`；顶栏「物品 | 合成」
- 可选 props：`recipes?` / `onCraftRecipe?`；无 `recipes` 时隐藏合成 Tab
- 另经 `CraftBagContext` 读取壳层注入（因背包由 `InventoryHudLayer`→`InventoryQuickbar` 打开，本任务未改 quickbar）

### Shell wiring
- `PlayerShell` / `RuntimeShell`：`useRecipesLibrary()` + `handleCraftRecipe`
  - `findRecipe` → `craftRecipeInInventory(..., Date.now())` → 成功则 `setInventory`
- 以 `CraftBagContext.Provider` 包裹壳内容，预览壳同样显示合成 Tab

## Verify

| Command | Result |
|---------|--------|
| `npm test -- --run` | 13 files / 87 tests passed |
| `npm run build` | OK (`dist/index.js`) |

## Concerns

1. 未改 `inventory-quickbar.tsx`：合成接线走 `CraftBagContext`，避免无法传 props。日后可在 quickbar 增加透传并逐步去掉 Context。
2. `inventoryHudMode === "always"` 时 HUD 挂在 App 层、壳外，无 Provider → 背包无合成 Tab；默认 `withScene` 正常。
3. 合成失败仅 `console.warn`，无 UI toast。

---

## Fix: always HUD craft tab (review follow-up)

**Status:** Done  
**Date:** 2026-08-08

### Problem
`inventoryHudMode === "always"` 时 `InventoryHudLayer` 挂载于 App 层、在 `CraftBagContext.Provider` 之外，背包无合成 Tab。

### Change (`src/runtime/inventory-quickbar.tsx`)
- `InventoryHudLayer`：`useRecipesLibrary()` + `handleCraftRecipe`（与 PlayerShell 一致：findRecipe → craftRecipeInInventory → setInventory）
- `InventoryQuickbar` 新增可选 `recipes` / `onCraftRecipe`，透传至 `InventoryBackpack`
- `withScene` 下 props 优先于 Context，两种 HUD 模式均可用

### Verify

| Command | Result |
|---------|--------|
| `npm test -- --run` | 13 files / 87 tests passed |
| `npm run build` | OK (`dist/index.js`) |
