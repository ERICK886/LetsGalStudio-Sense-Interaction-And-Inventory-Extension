# 场景 UI 预设 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将「获得提示」并入 UI「场景 UI」分区，新增全局交互点悬停预设；配置合并为 `editor.sceneUiJson`，交互点默认跟随全局、可开关自定义。

**Architecture:** 领域层 `SceneUiConfig`（itemToast + hotspotHover）+ `resolveHotspotHoverShadow`；存储走 `readAuthorSetting`/`writeAuthorSetting`（editor）；UI 改 tab + 二级子页；运行时 shells 读 sceneUi 的 toast，HotspotView 用 resolve 后的阴影。旧 `backpack-hud.itemToastJson` 只读迁移。

**Tech Stack:** TypeScript、React 18、现有 FormRenderer / item-toast / hover-shadow、`author-settings` cross 读写。

**Spec:** `docs/superpowers/specs/2026-08-08-scene-ui-presets-design.md`

## Global Constraints

- 禁止修改 `extension.json.id`（必须保持 `ext-27b96b`）
- 禁止手改 `sdk/` 与 `dist/`；只改 `src/` 后 `npm run build`
- 新增源码 kebab-case；文件头作者「池水三两升」、日期 `2026-08-08`、版本；详细中文注释
- 必要空行；严格模式；不用 `any`
- 无 Vitest；不以新建测试套件为交付；`npm run build` 验收
- Commit：仅用户明确要求时执行
- 对话与注释：中文
- 非目标：多套命名预设、按场景覆盖、一期删除 backpack-hud `itemToastJson` 声明

---

## File Structure（锁定）

```text
src/domain/
  types.ts                 # SceneUiConfig；HotspotHoverShadow.useGlobal?
  scene-ui-config.ts       # NEW: default/normalize/parse/stringify/resolveHotspotHover
  hover-shadow.ts          # normalize 保留 useGlobal
  serialize.ts             # hotspot normalize 写 useGlobal
src/store/
  scene-ui-settings.ts     # NEW: SCENE_UI_JSON_KEY + read/write + 迁移
  author-settings.ts       # 复用（不改 API）
src/modules/
  editor-extension.tsx     # settings 声明 sceneUiJson
src/editor/ui/
  ui-editor-panel.tsx      # tab「场景 UI」+ 二级子页
  item-toast-editor-panel.tsx  # 读写 sceneUi.itemToast
  hotspot-hover-editor-panel.tsx  # NEW: 编辑 sceneUi.hotspotHover
src/schema/
  hotspot-schema.ts        # useGlobal 开关 + 条件显示本地层
src/editor/panels/
  property-panel.tsx       # 若需配合条件 schema
  hotspot-list-panel.tsx   # 新建默认 useGlobal: true
src/runtime/
  hotspot-view.tsx         # 接收 globalHover，resolve 后 buildFilter
  scene-view.tsx           # 向下传 globalHover（或 shells 注入）
  runtime-shell.tsx        # toast + global hover 读 sceneUi
  player-shell.tsx
src/editor/preview-shell.tsx
```

**类型约定：**

```ts
export interface SceneUiConfig {
  version: 1;
  itemToast: ItemToastConfig;
  hotspotHover: HotspotHoverShadow; // 全局段忽略 useGlobal
}

// HotspotHoverShadow 增加：
useGlobal?: boolean; // 缺省/true = 跟随全局
```

**公开 API：**

```ts
// scene-ui-config.ts
export function defaultSceneUiConfig(): SceneUiConfig;
export function normalizeSceneUiConfig(raw: unknown): SceneUiConfig;
export function parseSceneUiJson(raw: string): SceneUiConfig;
export function stringifySceneUi(config: SceneUiConfig): string;
export function resolveHotspotHoverShadow(
  hotspot: Pick<HotspotElement, "hoverShadow">,
  globalHover: HotspotHoverShadow,
): HotspotHoverShadow;

// scene-ui-settings.ts
export const SCENE_UI_JSON_KEY = "sceneUiJson";
export function readSceneUiConfig(ctx: ExtensionContext): SceneUiConfig;
export function writeSceneUiConfig(ctx: ExtensionContext, config: SceneUiConfig): void;
```

---

### Task 1: 领域类型 + `scene-ui-config` + hover normalize

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/domain/scene-ui-config.ts`
- Modify: `src/domain/hover-shadow.ts`
- Modify: `src/domain/serialize.ts`

**Interfaces:**
- Consumes: `ItemToastConfig` / `defaultItemToastConfig` / `normalize` from item-toast-config；`defaultHotspotHoverShadow` / `normalizeHotspotHoverShadow`
- Produces: 上表 API；serialize 保留 `useGlobal`

- [ ] **Step 1: 类型**

在 `types.ts` 增加 `SceneUiConfig`；`HotspotHoverShadow` 增加可选 `useGlobal?: boolean`。文件头说明。

- [ ] **Step 2: `hover-shadow` normalize**

`normalizeHotspotHoverShadow`：若 raw 含 `useGlobal === false` 则写出 `useGlobal: false`；否则可省略或写 `true`（推荐：仅在 `=== false` 时写入 false，缺省表示跟随）。`defaultHotspotHoverShadow()` 增加 `useGlobal: true`。

- [ ] **Step 3: 新建 `scene-ui-config.ts`**

实现 default / normalize / parse / stringify：

```ts
export function defaultSceneUiConfig(): SceneUiConfig {
  return {
    version: 1,
    itemToast: defaultItemToastConfig(),
    hotspotHover: defaultHotspotHoverShadow(),
  };
}

export function resolveHotspotHoverShadow(
  hotspot: Pick<HotspotElement, "hoverShadow">,
  globalHover: HotspotHoverShadow,
): HotspotHoverShadow {
  const local = normalizeHotspotHoverShadow(hotspot.hoverShadow);
  if (local.useGlobal === false) {
    return local;
  }
  return normalizeHotspotHoverShadow(globalHover);
}
```

全局段 normalize 时去掉或忽略 `useGlobal`（强制不当决策源）。

- [ ] **Step 4: serialize**

`normalizeHotspotElement` 已用 `normalizeHotspotHoverShadow`——确保 useGlobal 不被丢掉。

- [ ] **Step 5: 构建**

Run: `npm run build`  
Expected: exit 0（或仅未接线处类型问题，记入报告）

- [ ] **Step 6: Commit（仅用户要求时）**

```bash
git commit -m "feat: add SceneUiConfig and resolveHotspotHoverShadow"
```

---

### Task 2: editor settings + `scene-ui-settings` 读写与迁移

**Files:**
- Create: `src/store/scene-ui-settings.ts`
- Modify: `src/modules/editor-extension.tsx`

**Interfaces:**
- Consumes: `readAuthorSetting` / `writeAuthorSetting` from `author-settings.ts`；`readHudSetting` + `ITEM_TOAST_JSON_KEY` 仅迁移
- Produces: `readSceneUiConfig` / `writeSceneUiConfig`

- [ ] **Step 1: 声明 setting**

`editor-extension.tsx`：

```ts
sceneUiJson: s.string("场景 UI 预设 JSON（获得提示 + 悬停）").default(""),
```

- [ ] **Step 2: `scene-ui-settings.ts`**

```ts
export const SCENE_UI_JSON_KEY = "sceneUiJson";

export function readSceneUiConfig(ctx: ExtensionContext): SceneUiConfig {
  const raw = readAuthorSetting(ctx, SCENE_UI_JSON_KEY);
  const fromEditor = typeof raw === "string" ? raw.trim() : "";
  if (fromEditor.length > 0) {
    return parseSceneUiJson(fromEditor);
  }
  // 迁移：旧 itemToastJson
  const legacy = readHudSetting(ctx, ITEM_TOAST_JSON_KEY);
  const legacyStr = typeof legacy === "string" ? legacy.trim() : "";
  if (legacyStr.length > 0) {
    const base = defaultSceneUiConfig();
    base.itemToast = parseItemToastJson(legacyStr);
    return normalizeSceneUiConfig(base);
  }
  return defaultSceneUiConfig();
}

export function writeSceneUiConfig(ctx: ExtensionContext, config: SceneUiConfig): void {
  writeAuthorSetting(ctx, SCENE_UI_JSON_KEY, stringifySceneUi(config));
  notifySettingsField(SCENE_UI_JSON_KEY);
}
```

编辑器打开「场景 UI」页时：若发生了 legacy 迁移，可 `writeSceneUiConfig` 一次落盘（在 Task 3 面板 mount 时调用）。

- [ ] **Step 3: 构建**

Run: `npm run build`  
Expected: exit 0

- [ ] **Step 4: Commit（仅用户要求时）**

```bash
git commit -m "feat: persist sceneUiJson on editor with toast migration"
```

---

### Task 3: UI「场景 UI」分区 + 两子页

**Files:**
- Modify: `src/editor/ui/ui-editor-panel.tsx`
- Modify: `src/editor/ui/item-toast-editor-panel.tsx`
- Create: `src/editor/ui/hotspot-hover-editor-panel.tsx`

**Interfaces:**
- Consumes: `readSceneUiConfig` / `writeSceneUiConfig`
- Produces: 左侧「场景 UI」；二级「获得提示」「交互点悬停」

- [ ] **Step 1: 改 tab**

`UiSubSection`：`"itemToast"` → `"sceneUi"`。  
`tabBtn("sceneUi", "场景 UI")`。  
进入 `sceneUi` 时：state `sceneUiTab: "itemToast" | "hotspotHover"`，中栏顶部分段按钮切换。

右侧属性栏：`sceneUi` 时与现 itemToast 一样可隐藏节点属性（保持 `display: none` 逻辑，把条件从 itemToast 改为 sceneUi）。

- [ ] **Step 2: 改造 ItemToastEditorPanel**

- 读：`const ui = readSceneUiConfig(ctx); setConfig(ui.itemToast)`
- 写：`const ui = readSceneUiConfig(ctx); writeSceneUiConfig(ctx, { ...ui, itemToast: next })`
- mount：若 editor 键空且迁入成功，写回一次
- 去掉对 `ITEM_TOAST_JSON_KEY` / `writeHudSetting` 的权威写入
- `notifySettingsField(SCENE_UI_JSON_KEY)`；历史桥若依赖字段名则同步改

- [ ] **Step 3: 新建 HotspotHoverEditorPanel**

- FormRenderer：复用 hotspot-schema 中 hover 字段列表，或抽 `hotspotHoverFields()` 无 useGlobal
- 读写下 `sceneUi.hotspotHover`
- 简易说明文案：「未勾选自定义的交互点将使用此预设」

- [ ] **Step 4: 构建**

Run: `npm run build`  
Expected: exit 0

- [ ] **Step 5: Commit（仅用户要求时）**

```bash
git commit -m "feat: scene UI tab with toast and hover preset editors"
```

---

### Task 4: 交互点属性「跟随全局」

**Files:**
- Modify: `src/schema/hotspot-schema.ts`
- Modify: `src/editor/panels/hotspot-list-panel.tsx`（`createDefaultHotspot`）
- Modify: `src/editor/panels/property-panel.tsx`（若 FormRenderer 需完整默认）

**Interfaces:**
- Consumes: `useGlobal` 字段
- Produces: 默认跟随；自定义时才显示本地层

- [ ] **Step 1: schema 条件字段**

在 `hotspotFields(hotspot)`：

```ts
{
  key: "hoverShadow.useGlobal",
  kind: "boolean",
  label: "跟随全局悬停预设",
  description: "开启后由「界面 → 场景 UI → 交互点悬停」控制；关闭后可单独设置",
},
```

当 `hotspot.hoverShadow?.useGlobal !== false` 时：**不**渲染 glow/base 本地字段（可放一段 string/hint 字段或仅 description）。  
当 `=== false` 时：渲染现有 glow/base section。

注意：FormRenderer boolean 写入 `useGlobal`；关闭跟随时确保本地层存在（property-panel `withHotspotFormDefaults` 已 normalize）。

- [ ] **Step 2: 新建默认**

`createDefaultHotspot`：`hoverShadow: { ...defaultHotspotHoverShadow(), useGlobal: true }`。

- [ ] **Step 3: 构建**

Run: `npm run build`  
Expected: exit 0

- [ ] **Step 4: Commit（仅用户要求时）**

```bash
git commit -m "feat: hotspot hover follow global preset toggle"
```

---

### Task 5: 运行时 Toast + HotspotView resolve

**Files:**
- Modify: `src/runtime/runtime-shell.tsx`
- Modify: `src/runtime/player-shell.tsx`
- Modify: `src/editor/preview-shell.tsx`
- Modify: `src/runtime/scene-view.tsx`
- Modify: `src/runtime/hotspot-view.tsx`

**Interfaces:**
- Consumes: `readSceneUiConfig`；`resolveHotspotHoverShadow`；`buildHoverShadowFilter`
- Produces: Toast 与悬停均消费 sceneUi

- [ ] **Step 1: Toast 入队**

三壳 `handleEnqueueToast`：

```ts
const sceneUi = readSceneUiConfig(ctx);
const global = sceneUi.itemToast;
// 原 parseItemToastJson(readHudSetting(...)) 删除
const appearance = resolveItemToastAppearance(global, overrides);
```

- [ ] **Step 2: 全局悬停下传**

shells：`const globalHover = readSceneUiConfig(ctx).hotspotHover`（或 subscribe 设置变更后刷新——若现有 toast 无订阅，至少每次 enqueue/render 读最新；HotspotView 父级在 settings 通知时重渲染）。

`SceneView` 增加 prop `globalHoverShadow: HotspotHoverShadow`，传给每个 `HotspotView`。

`HotspotView`：

```ts
const resolved = resolveHotspotHoverShadow(hotspot, globalHoverShadow);
const hoverFilter = buildHoverShadowFilter(resolved);
```

订阅：若 `subscribeSettingsField(SCENE_UI_JSON_KEY)` 已有模式，在 shell 里 listen 后 `setSceneUi` state；否则每次 render 读 ctx（与现 toast 读法对齐即可）。

- [ ] **Step 3: 构建**

Run: `npm run build`  
Expected: exit 0

- [ ] **Step 4: Commit（仅用户要求时）**

```bash
git commit -m "feat: runtime consume sceneUiJson for toast and hover"
```

---

### Task 6: 全量验收

- [ ] **Step 1: `npm run build`** — exit 0

- [ ] **Step 2: Spec 清单**

- [ ] tab「场景 UI」+ 两子页  
- [ ] `editor.sceneUiJson` 声明与读写  
- [ ] 旧 itemToastJson 迁移  
- [ ] useGlobal 默认跟随 + 自定义展开  
- [ ] HotspotView resolve  
- [ ] Toast 读 sceneUi  

- [ ] **Step 3: 手动**（作者环境）对照 spec §6

- [ ] **Step 4: Commit（仅用户要求时）**

---

## Spec 覆盖自检

| Spec | Task |
| --- | --- |
| SceneUiConfig + sceneUiJson on editor | 1–2 |
| 迁移 itemToastJson | 2–3 |
| UI 场景 UI + 子页 | 3 |
| useGlobal 属性面板 | 4 |
| 运行时 toast + hover | 5 |
| 验收 / build | 6 |

无 TBD。
