# 场景交互系统 v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `ext-27b96b` 交付配方编辑/合成，以及由剧本打开、阻塞剧情的玩家界面（同扩展内新壳，非新 extension）。

**Architecture:** 作者库新增 `recipesLibraryJson`；纯逻辑 `consumeItem` / `craftRecipe`；编辑器顶栏增加「配方」分区；`PlayerShell` 与预览 `RuntimeShell` 分流；`openSceneInteraction` 在 `ctx.ui.show` 后 await 关闭 Promise 以阻塞剧情。

**Tech Stack:** TypeScript、React 18、Vite 5（库模式）、`@avg-studio/sdk`（本地 `sdk/`）、Vitest 2。

**Spec:** `docs/superpowers/specs/2026-08-08-scene-interaction-v02-design.md`

## Global Constraints

- 禁止修改 `extension.json.id`（必须保持 `ext-27b96b`）
- 禁止手改 `sdk/` 与 `dist/`；行为变更只改 `src/` 后 `npm run build`
- 新增源码：`kebab-case.ts` / `kebab-case.tsx`
- 文件头注释：文件名、作者「池水三两升」、日期 `2026-08-08`、版本；函数含详细中文注释（参数/返回值/异常/示例）
- 必要空行提高可读性
- TypeScript 严格模式，不用 `any` 掩盖 SDK 契约
- JSON 自有格式，根对象 `version: 1`；不对齐大地图
- 不做新 extension；不做配方概率/工作台/解锁
- 重复打开 `openSceneInteraction`：**若已在等待关闭中，忽略二次打开并保持同一 Promise**
- unique 消耗顺序：**按 `lastGainedAt` 升序（最旧先扣）**
- 包管理：npm
- Commit 步骤：仅当用户明确要求提交时执行；否则跳过 git commit

---

## File Structure（锁定）

```text
src/
  domain/
    types.ts                         # + RecipeDefinition / RecipesLibraryFile
    serialize.ts                     # + parse/stringify recipes
    inventory.ts                     # + consumeItemFromInventory
    crafting.ts                      # NEW: canCraft / craftRecipeInInventory
    recipe-registry.ts               # NEW: findRecipe
  store/
    recipes-persistence.ts           # NEW: settings.recipesLibraryJson hook
  schema/
    item-schema.ts                   # 堆叠文案简化
    recipe-schema.ts                 # NEW
  editor/
    editor-shell.tsx                 # EditorSection += "recipes"
    panels/
      recipe-list-panel.tsx          # NEW
      recipe-property-panel.tsx      # NEW
      recipe-preview-panel.tsx       # NEW
    io/import-export.ts              # + recipes 导入导出
  runtime/
    player-shell.tsx                 # NEW: 玩家全屏壳 + 退出
    inventory-backpack.tsx           # + 合成 Tab
    craft-panel.tsx                  # NEW: 配方列表与合成按钮
    player-session.ts                # NEW: 关闭 Promise 门闩
  methods/
    scene-methods.ts                 # + open/closeSceneInteraction
    inventory-methods.ts             # + craftRecipe（可选剧本）
  app/
    scene-interaction-app.tsx        # props 分流 PlayerShell
  index.tsx                          # settings + methods 注册

tests/
  domain/serialize-recipes.test.ts   # NEW 或扩 serialize.test.ts
  domain/inventory-consume.test.ts   # NEW
  domain/crafting.test.ts            # NEW
  methods/player-session.test.ts     # NEW（纯 Promise 门闩）
```

---

### Task 1: 堆叠文案 + 配方类型

**Files:**
- Modify: `src/schema/item-schema.ts`
- Modify: `src/domain/types.ts`
- Test: 无（文案/类型）；后续 Task 2 覆盖序列化

**Interfaces:**
- Produces: `RecipeIngredient`, `RecipeDefinition`, `RecipesLibraryFile`

- [ ] **Step 1: 改堆叠描述**

将 `item-schema.ts` 中 `stackable.description` 改为：

```ts
description: "开启后相同物品合并数量；关闭则每次独立获得",
```

- [ ] **Step 2: 在 `types.ts` 追加类型（ItemsLibraryFile 之后）**

```ts
/** 配方原料/产物一行 */
export interface RecipeItemAmount {
  itemId: string;
  /** 数量；规范化后 >= 1 */
  count: number;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  ingredients: RecipeItemAmount[];
  products: RecipeItemAmount[];
  description?: string;
}

export interface RecipesLibraryFile {
  version: 1;
  recipes: RecipeDefinition[];
}
```

- [ ] **Step 3: 确认 `tsc`/现有测试不破**

Run: `npm test -- --run`
Expected: 全部 PASS

- [ ] **Step 4: Commit（若用户要求）**

```bash
git add src/schema/item-schema.ts src/domain/types.ts
git commit -m "docs(ui): simplify stackable copy; add recipe types"
```

---

### Task 2: 配方序列化

**Files:**
- Modify: `src/domain/serialize.ts`
- Test: `tests/domain/serialize.test.ts`（追加 describe）或 `tests/domain/serialize-recipes.test.ts`

**Interfaces:**
- Consumes: `RecipesLibraryFile`（Task 1）
- Produces: `emptyRecipesLibrary`, `parseRecipesLibraryJson`, `stringifyRecipesLibrary`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import {
  emptyRecipesLibrary,
  parseRecipesLibraryJson,
  stringifyRecipesLibrary,
} from "../../src/domain/serialize";

describe("parseRecipesLibraryJson", () => {
  it("非法 JSON 回退空库", () => {
    const lib = parseRecipesLibraryJson("{");
    expect(lib).toEqual({ version: 1, recipes: [] });
  });

  it("round-trip 保留原料与产物", () => {
    const src = {
      version: 1 as const,
      recipes: [
        {
          id: "r1",
          name: "药水",
          ingredients: [{ itemId: "herb", count: 2 }],
          products: [{ itemId: "potion", count: 1 }],
          description: "合成药水",
        },
      ],
    };
    const again = parseRecipesLibraryJson(stringifyRecipesLibrary(src));
    expect(again).toEqual(src);
  });

  it("count < 1 规范化为 1；空 itemId 行丢弃", () => {
    const lib = parseRecipesLibraryJson(
      JSON.stringify({
        version: 1,
        recipes: [
          {
            id: "r1",
            name: "x",
            ingredients: [
              { itemId: "a", count: 0 },
              { itemId: "", count: 3 },
            ],
            products: [{ itemId: "b", count: 2 }],
          },
        ],
      }),
    );
    expect(lib.recipes[0]!.ingredients).toEqual([{ itemId: "a", count: 1 }]);
    expect(lib.recipes[0]!.products).toEqual([{ itemId: "b", count: 2 }]);
  });
});

describe("emptyRecipesLibrary", () => {
  it("返回 version 1 空数组", () => {
    expect(emptyRecipesLibrary()).toEqual({ version: 1, recipes: [] });
  });
});
```

- [ ] **Step 2: Run 确认失败**

Run: `npm test -- --run tests/domain/serialize-recipes.test.ts`
Expected: FAIL（模块未导出）

- [ ] **Step 3: 实现**（对齐 `parseItemsLibraryJson` 风格）

```ts
export function emptyRecipesLibrary(): RecipesLibraryFile {
  return { version: 1, recipes: [] };
}

function normalizeRecipeItemAmount(raw: unknown): RecipeItemAmount | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const itemId = typeof obj.itemId === "string" ? obj.itemId.trim() : "";
  if (!itemId) return null;
  const n = typeof obj.count === "number" && Number.isFinite(obj.count) ? obj.count : 1;
  return { itemId, count: Math.max(1, Math.floor(n)) };
}

export function parseRecipesLibraryJson(json: string): RecipesLibraryFile {
  // safeParseJson → 校验 version/recipes 数组 → map 每条 recipe
  // 非法整包 → emptyRecipesLibrary() + logError
}

export function stringifyRecipesLibrary(lib: RecipesLibraryFile): string {
  return JSON.stringify({ version: 1, recipes: lib.recipes });
}
```

- [ ] **Step 4: Run 确认通过**

Run: `npm test -- --run tests/domain/serialize-recipes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit（若用户要求）**

---

### Task 3: consumeItem + crafting 纯逻辑

**Files:**
- Modify: `src/domain/inventory.ts`
- Create: `src/domain/crafting.ts`
- Create: `src/domain/recipe-registry.ts`
- Test: `tests/domain/inventory-consume.test.ts`, `tests/domain/crafting.test.ts`

**Interfaces:**
- Produces:
  - `consumeItemFromInventory(state, itemId, count): { ok: true; state } | { ok: false; reason: string }`
  - `aggregateRecipeNeeds(recipe): Map<itemId, count>`（或 Record）
  - `canCraftRecipe(state, recipe): boolean`
  - `craftRecipeInInventory(state, recipe, items, nowMs): { ok: true; state } | { ok: false; reason }`
  - `findRecipe(recipes, idOrName): RecipeDefinition | undefined`

- [ ] **Step 1: consume 失败测试**

```ts
import { describe, expect, it } from "vitest";
import {
  consumeItemFromInventory,
  giveItemToInventory,
  getItemCount,
} from "../../src/domain/inventory";
import type { ItemDefinition, InventoryState } from "../../src/domain/types";

const stackItem: ItemDefinition = {
  id: "herb",
  name: "草药",
  description: "",
  icon: "",
  detailImage: "",
  stackable: true,
  maxStack: 99,
};

const uniqueItem: ItemDefinition = {
  id: "key",
  name: "钥匙",
  description: "",
  icon: "",
  detailImage: "",
  stackable: false,
};

describe("consumeItemFromInventory", () => {
  it("堆叠不足则失败且不改动", () => {
    let state: InventoryState = { entries: [] };
    state = giveItemToInventory(state, stackItem, 2, 1000);
    const r = consumeItemFromInventory(state, "herb", 3);
    expect(r.ok).toBe(false);
    expect(getItemCount(state, "herb")).toBe(2);
  });

  it("堆叠扣减成功", () => {
    let state: InventoryState = { entries: [] };
    state = giveItemToInventory(state, stackItem, 5, 1000);
    const r = consumeItemFromInventory(state, "herb", 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(getItemCount(r.state, "herb")).toBe(2);
  });

  it("unique 按 lastGainedAt 升序先扣最旧", () => {
    let state: InventoryState = { entries: [] };
    state = giveItemToInventory(state, uniqueItem, 1, 100);
    state = giveItemToInventory(state, uniqueItem, 1, 200);
    const r = consumeItemFromInventory(state, "key", 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.entries).toHaveLength(1);
      expect(r.state.entries[0]!.lastGainedAt).toBe(200);
    }
  });
});
```

- [ ] **Step 2: Run 确认失败 → 实现 `consumeItemFromInventory`**

规则：
- `count < 1` → `{ ok: false, reason: "invalid-count" }`
- `getItemCount < count` → `{ ok: false, reason: "insufficient" }`，不改 state
- 堆叠：找到 `kind==="stack" && itemId`，减 count，≤0 则移除条目
- unique：过滤同 itemId，按 `lastGainedAt` **升序**去掉前 `count` 条，其余条目保留
- 返回新 state（不可变）

- [ ] **Step 3: crafting 测试 + 实现**

```ts
// canCraft：合计 ingredients 后逐 itemId 比较 getItemCount
// craftRecipeInInventory：
//   1) 校验 recipe 所有 ingredients/products 的 item 均在 items 中能找到，否则 fail "missing-item"
//   2) canCraft 否则 fail "insufficient"
//   3) 对合计后的每个原料 consume（任一步失败则整次失败——因先 canCraft，正常不应失败）
//   4) 对每个 product 调用 giveItemToInventory(..., count, nowMs)
```

`recipe-registry.ts`：

```ts
export function findRecipe(
  recipes: readonly RecipeDefinition[],
  idOrName: string,
): RecipeDefinition | undefined {
  const key = idOrName.trim();
  if (!key) return undefined;
  return (
    recipes.find((r) => r.id === key) ??
    recipes.find((r) => r.name === key)
  );
}
```

- [ ] **Step 4: `npm test -- --run` 全绿**

- [ ] **Step 5: Commit（若用户要求）**

---

### Task 4: recipes 持久化 + settings 注册

**Files:**
- Create: `src/store/recipes-persistence.ts`（照抄 `items-persistence.ts`，key=`recipesLibraryJson`）
- Modify: `src/index.tsx`（settings 增加字段）

**Interfaces:**
- Produces: `useRecipesLibrary(): [RecipesLibraryFile, (next) => void]`
- Settings key: `recipesLibraryJson` default `'{"version":1,"recipes":[]}'`

- [ ] **Step 1: 实现 `recipes-persistence.ts`**

导出：
- `RECIPES_LIBRARY_SETTINGS_KEY = "recipesLibraryJson"`
- `EMPTY_RECIPES_LIBRARY_JSON`
- `readRecipesLibraryJson` / `writeRecipesLibraryJson`
- `useRecipesLibrary`

- [ ] **Step 2: 在 `index.tsx` settings 中，紧挨 `itemsLibraryJson` 增加**

```ts
recipesLibraryJson: s
  .string("配方库 JSON（自动维护）")
  .default('{"version":1,"recipes":[]}'),
```

- [ ] **Step 3: `npm run build` 成功**

- [ ] **Step 4: Commit（若用户要求）**

---

### Task 5: 配方 Schema + 编辑器分区

**Files:**
- Create: `src/schema/recipe-schema.ts`
- Create: `src/editor/panels/recipe-list-panel.tsx`
- Create: `src/editor/panels/recipe-property-panel.tsx`
- Create: `src/editor/panels/recipe-preview-panel.tsx`
- Modify: `src/editor/editor-shell.tsx`
- Modify: `src/app/scene-interaction-app.tsx`（`EditorSection` 联合类型）

**Interfaces:**
- `EditorSection = "scenes" | "items" | "recipes"`
- `recipeFields(recipe, items): FieldSchema[]` —— ingredients/products 用可重复的 itemId+count 行（若现有 FormRenderer 无数组控件：用简易自定义列表 UI 写在 `recipe-property-panel`，不必强行扩 FormRenderer）

- [ ] **Step 1: 扩展 `EditorSection` 与顶栏第三个 Tab「配方」**

- [ ] **Step 2: `RecipeListPanel`**

行为对齐 `ItemListPanel` 精简版：新建（`createId("recipe")`）、删除、选中；默认名「未命名配方」、空 ingredients/products。

- [ ] **Step 3: `RecipePropertyPanel`**

- 名称、描述文本框
- 原料列表 / 产物列表：每行「物品下拉（来自 items）+ 数量 number + 删除」；「添加一行」
- 变更写回 `onRecipeChange(next: RecipeDefinition)`

- [ ] **Step 4: `RecipePreviewPanel`**

中栏展示：`原料A x2 + 原料B x1 → 产物C x1` 纯文本摘要；无选中时提示「请选择配方」。

- [ ] **Step 5: `editor-shell` 三栏切换到 recipes 时挂载上述面板；history 撤销栈可复用 items 路径的独立 `HistoryStack` 或与 items 共用策略——**本任务：配方库使用独立 `HistoryStack`（与 scenes/items 并列），Ctrl+Z 在 recipes 分区只撤销配方。**

- [ ] **Step 6: Studio 手动点开「配方」Tab 能新建并保存（settings 有 JSON）；`npm run build`**

- [ ] **Step 7: Commit（若用户要求）**

---

### Task 6: player-session 门闩

**Files:**
- Create: `src/runtime/player-session.ts`
- Test: `tests/methods/player-session.test.ts`

**Interfaces:**
- Produces:
  - `beginPlayerSessionWait(): Promise<void>` — 若已有 pending，返回同一 Promise
  - `endPlayerSessionWait(): void` — resolve pending；无 pending 则 no-op
  - `isPlayerSessionPending(): boolean`

- [ ] **Step 1: 测试**

```ts
import { describe, expect, it } from "vitest";
import {
  beginPlayerSessionWait,
  endPlayerSessionWait,
  isPlayerSessionPending,
} from "../../src/runtime/player-session";

describe("player-session", () => {
  it("end 解除 begin 的 await", async () => {
    const p = beginPlayerSessionWait();
    expect(isPlayerSessionPending()).toBe(true);
    queueMicrotask(() => endPlayerSessionWait());
    await p;
    expect(isPlayerSessionPending()).toBe(false);
  });

  it("重复 begin 复用同一 Promise", async () => {
    const a = beginPlayerSessionWait();
    const b = beginPlayerSessionWait();
    expect(a).toBe(b);
    endPlayerSessionWait();
    await a;
  });
});
```

- [ ] **Step 2: 实现（模块级 `let pending: { promise, resolve } | null`）**

- [ ] **Step 3: 测试通过**

---

### Task 7: PlayerShell + App 分流

**Files:**
- Create: `src/runtime/player-shell.tsx`
- Modify: `src/app/scene-interaction-app.tsx`
- Modify: `src/index.tsx` `render()` —— **不改**；props 由 `ui.show` 注入

**Interfaces:**
- `SceneInteractionAppProps` 增加可选：
  - `playerPresentation?: boolean`（已有则复用）
  - `playerSession?: "modal" | undefined`
- 当 `playerSession === "modal"`：渲染 `PlayerShell`（即使 `isEditMode` 也为 false 路径）
- `PlayerShell` props：`save`, `onRequestClose: () => void`（内部退出按钮调用；方法层也会 hide）

- [ ] **Step 1: 实现 `PlayerShell`**

结构（可大量复用 `RuntimeShell` 逻辑，但**不要**编辑顶栏）：
- 全屏列布局
- 顶条：标题「场景交互」+ 按钮「退出」→ `onRequestClose`
- 主体：`SceneView` + 快捷栏 + 打开背包
- 背包打开时叠层（后续 Task 9 加合成 Tab）
- 挂载时：若需要，不自动 end session

退出按钮：

```ts
onClick={() => {
  onRequestClose();
}}
```

- [ ] **Step 2: App 分流**

```tsx
// props.playerSession === "modal" → 动态 import PlayerShell
// else 保持 isEditing ? Editor : RuntimeShell
```

注意：动态 import 仍遵守 `inlineDynamicImports`；占位后再加载。

- [ ] **Step 3: `npm run build`**

- [ ] **Step 4: Commit（若用户要求）**

---

### Task 8: openSceneInteraction / closeSceneInteraction

**Files:**
- Modify: `src/methods/scene-methods.ts`
- Modify: `src/index.tsx`（注册 static methods）
- Modify: `src/runtime/player-shell.tsx`（退出时调 hide + endWait——经 props 注入的 `onRequestClose`）

**Interfaces:**
- `openSceneInteraction` method id: `open-scene-interaction`
- `closeSceneInteraction` method id: `close-scene-interaction`
- UI id 常量复用 `SCENE_INTERACTION_UI_ID = "scene-interaction"`

- [ ] **Step 1: 实现 `openSceneInteraction`**

```ts
export const openSceneInteraction = method({
  id: "open-scene-interaction",
  title: "打开场景交互（阻塞）",
  schema: {
    sceneIdOrName: { type: "string", label: "场景 ID/名称", required: false },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    // 1) 若提供 sceneIdOrName：解析并写入 currentSceneId；无效则 result=false return
    // 2) 若未提供：沿用 save.currentSceneId；为空则尝试 settings.defaultSceneId
    // 3) isEditMode = false
    // 4) await ctx.ui.show(SCENE_INTERACTION_UI_ID, {
    //      playerPresentation: true,
    //      playerSession: "modal",
    //    }, { size: "(100%, 100%)", position: "(0, 0)", interactable: true })
    // 5) await beginPlayerSessionWait()
    // 6) writeResult true
  },
});
```

- [ ] **Step 2: 实现 `closeSceneInteraction`**

```ts
async run(ctx, params) {
  try {
    await ctx.ui.hide(SCENE_INTERACTION_UI_ID);
  } catch (err) {
    logError(...);
  }
  endPlayerSessionWait();
  writeResult(ctx, params.resultVariable, true);
}
```

- [ ] **Step 3: PlayerShell / App 的 `onRequestClose`**

```ts
async () => {
  try {
    await ctx.ui.hide(SCENE_INTERACTION_UI_ID);
  } catch { /* log */ }
  endPlayerSessionWait();
}
```

（`useExtensionContext` 取 `ctx.ui`）

- [ ] **Step 4: 在 `index.tsx` 注册**

```ts
static openSceneInteraction = openSceneInteraction;
static closeSceneInteraction = closeSceneInteraction;
```

- [ ] **Step 5: 文档注释：现有 `openScene` 不阻塞；阻塞请用新方法**

- [ ] **Step 6: `npm test -- --run` && `npm run build`**

- [ ] **Step 7: Commit（若用户要求）**

---

### Task 9: 背包合成 UI

**Files:**
- Create: `src/runtime/craft-panel.tsx`
- Modify: `src/runtime/inventory-backpack.tsx`
- Modify: `src/runtime/player-shell.tsx`（传入 recipes + onCraft + setInventory）
- Modify: `src/runtime/runtime-shell.tsx`（预览壳也可只读展示合成：v0.2 **预览壳同样显示合成 Tab**，便于 Studio 调试；不阻塞）

**Interfaces:**
- `CraftPanelProps`: `{ recipes, items, inventory, onCraft(recipeId): void }`
- `onCraft`：壳层执行 `craftRecipeInInventory`，成功则写回 inventory save

- [ ] **Step 1: `CraftPanel`**

- 列表每行：配方名、原料摘要、按钮「合成」
- `canCraftRecipe` 为 false 时按钮 disabled，旁注「原料不足」
- 点击 → `onCraft(recipe.id)`

- [ ] **Step 2: Backpack 增加 Tab**

```tsx
type BagTab = "items" | "craft";
// 顶栏两个按钮：物品 | 合成
// items → 现有网格；craft → <CraftPanel ... />
```

扩展 props：

```ts
recipes?: readonly RecipeDefinition[];
onCraftRecipe?: (recipeId: string) => void;
```

无 `recipes` 时不显示合成 Tab（编辑器无关）。

- [ ] **Step 3: PlayerShell / RuntimeShell 接线**

- `useRecipesLibrary` 或读 settings
- `onCraftRecipe`：读 inventory → craft → `writeInventory` / save.set

- [ ] **Step 4: 手动：预览给物后在合成分页能合成；`npm run build`**

- [ ] **Step 5: Commit（若用户要求）**

---

### Task 10: craftRecipe 方法 + 配方导入导出

**Files:**
- Modify: `src/methods/inventory-methods.ts`
- Modify: `src/index.tsx`
- Modify: `src/editor/io/import-export.ts`
- Modify: `src/editor/editor-shell.tsx`（配方分区导入/导出按钮）

**Interfaces:**
- method id: `craft-recipe`，params: `recipeIdOrName`, `resultVariable?`
- `exportRecipesLibrary` / `importRecipesLibrary` / `downloadJsonFile` 复用现有 helper

- [ ] **Step 1: `craftRecipe` method**

```ts
async run(ctx, params) {
  // 读 recipesLibraryJson + itemsLibraryJson + inventoryJson
  // findRecipe → craftRecipeInInventory → 写回 inventoryJson
  // resultVariable = ok
}
```

- [ ] **Step 2: 导入导出**

对齐 items：`导出配方 JSON` / `导入配方 JSON`，仅在 `editorSection === "recipes"` 显示。

- [ ] **Step 3: 测试 + build**

Run: `npm test -- --run` && `npm run build`
Expected: 全绿；`dist/index.js` 更新

- [ ] **Step 4: Commit（若用户要求）**

---

### Task 11: 打磨与验收

**Files:**
- Modify: `extension.json` version → `0.2.0`（若项目用该字段表示扩展版本）
- Modify: `docs/superpowers/specs/2026-08-08-scene-interaction-v02-design.md` 状态已为已批准则无需改

- [ ] **Step 1: 回归清单（人工）**

1. 堆叠文案已简化  
2. 编辑器可建配方并持久化  
3. Studio 预览：合成可用  
4. 剧本 `打开场景交互（阻塞）` → 界面在对话框下 → 退出后后续对白继续  
5. `关闭场景交互` 能结束等待  
6. 二次打开不产生双重 Promise 泄漏  

- [ ] **Step 2: `npm test -- --run` && `npm run build`**

- [ ] **Step 3: Commit（若用户要求）**

---

## Spec Coverage（自检）

| 规格项 | 任务 |
|--------|------|
| 堆叠文案 | T1 |
| recipes 类型/序列化 | T1–T2 |
| consume + craft 规则 / unique 最旧先扣 | T3 |
| settings.recipesLibraryJson | T4 |
| 编辑器配方分区 | T5 |
| PlayerShell / 预览分流 | T7 |
| open/close 阻塞 await | T6+T8 |
| 重复打开复用 Promise | T6 |
| 背包合成 UI | T9 |
| craftRecipe 方法 + 导入导出 | T10 |
| 非新 extension / 不改 id | Global |
| 对话框层下 | 宿主 ui.show（T8 注释说明） |

## Placeholder 扫描

无 TBD；重复打开与 unique 顺序已在 Global Constraints 钉死。
