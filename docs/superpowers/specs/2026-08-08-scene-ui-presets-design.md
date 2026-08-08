/**
 * 2026-08-08-scene-ui-presets-design.md
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 1.0.0
 *
 * 场景 UI 预设：获得提示 + 交互点悬停全局配置（挂 editor.sceneUiJson）。
 */

# 场景 UI 预设（获得提示 + 交互点悬停）— 设计规格

- **状态**: 已批准；实现计划见 `docs/superpowers/plans/2026-08-08-scene-ui-presets.md`
- **包**: `ext-27b96b`
- **相关**: 获得提示原规格 `2026-08-08-item-toast-style-placement-design.md`；悬停阴影 `2026-08-08-hotspot-hover-shadow-design.md`

## 1. 背景与决策

### 1.1 现状

- UI 分区三页：快捷栏 HUD / 全屏背包 / **获得提示**（独立 tab，settings：`backpack-hud.itemToastJson`）
- 交互点悬停阴影仅 per-hotspot `hoverShadow`，无工程级全局预设
- 作者库（场景/物品等）已挂 `editor` settings，运行时经 `settings.cross.get("editor", …)` 读取

### 1.2 已确认方向

| 项 | 选择 |
| --- | --- |
| 信息架构 | 将「获得提示」**改名为「场景 UI」**；页内二级：获得提示 / 交互点悬停 |
| 全局悬停 vs 单点 | **跟随全局 +「自定义」开关**（默认跟随） |
| 存储 | **合并** `sceneUiJson = { version, itemToast, hotspotHover }`，**挂 `editor` settings** |
| 旧 Toast 键 | 一期 **只读迁移** `backpack-hud.itemToastJson` → `sceneUiJson.itemToast`；新写入只进 `sceneUiJson` |

### 1.3 非目标

- 多套命名预设切换 / 导入导出独立预设包
- 按场景覆盖全局 Scene UI
- 一期从 backpack-hud 删除 `itemToastJson` 声明
- 改变 giveItem 动作级 Toast 覆盖语义（仍可覆盖全局 itemToast）

---

## 2. 数据模型

### 2.1 `SceneUiConfig`

```ts
interface SceneUiConfig {
  version: 1;
  /** 获得物品 Toast 全局默认（结构同现 ItemToastConfig） */
  itemToast: ItemToastConfig;
  /** 交互点悬停阴影全局默认（结构同 HotspotHoverShadow，不含 useGlobal） */
  hotspotHover: HotspotHoverShadow;
}
```

`HotspotHoverShadow`（全局段）字段与现双层阴影一致：`enabled` / `glow` / `base`。全局对象**不使用** `useGlobal`（该标志仅属于交互点实例）。

### 2.2 交互点 `hoverShadow` 扩展

```ts
interface HotspotHoverShadow {
  /** 默认 true / 缺省：跟随 SceneUiConfig.hotspotHover */
  useGlobal?: boolean;
  enabled: boolean;
  glow: HoverShadowLayer;
  base: HoverShadowLayer;
}
```

| `useGlobal` | 运行时使用的阴影 |
| --- | --- |
| `undefined` 或 `true` | `SceneUiConfig.hotspotHover`（经 normalize） |
| `false` | 本地点 `enabled/glow/base` |

新建交互点：`useGlobal: true`，本地层仍填 `defaultHotspotHoverShadow()` 的层数据（便于关闭跟随后有可编辑底稿）。

### 2.3 Settings

| 键 | 模块 | 说明 |
| --- | --- | --- |
| `sceneUiJson` | `editor` | 主存储；string JSON |
| `itemToastJson` | `backpack-hud` | 旧键；仅迁移读取，不再作为写入目标 |

辅助 API（建议 `src/store/scene-ui-settings.ts` 或扩展 `hud-settings` 旁新文件）：

- `SCENE_UI_JSON_KEY = "sceneUiJson"`
- `readSceneUiConfig(ctx)` / `writeSceneUiConfig(ctx, config)`
- 读路径：`settings.cross.get("editor", key)`，与场景库一致
- 写路径：`settings.cross.set("editor", key, …)`

领域：`src/domain/scene-ui-config.ts`

- `defaultSceneUiConfig()`
- `normalizeSceneUiConfig(raw)`
- `parseSceneUiJson` / `stringifySceneUi`
- `resolveHotspotHoverShadow(hotspot, global): HotspotHoverShadow`（应用 useGlobal 规则；返回用于 `buildHoverShadowFilter` 的对象，**不含**决策用的 useGlobal 亦可，实现任选只要 filter 正确）

---

## 3. 迁移

首次 `readSceneUiConfig`：

1. 解析 `editor.sceneUiJson`；若合法非空 → normalize 后返回  
2. 否则尝试 `readHudSetting(itemToastJson)`；若有 →  
   `defaultSceneUiConfig()` 且 `itemToast = parseItemToastJson(旧值)`，`hotspotHover = defaultHotspotHoverShadow()`  
3. 都没有 → `defaultSceneUiConfig()`  
4. **可选写回**：迁移成功后 `writeSceneUiConfig` 一次，避免每次读旧键（推荐：编辑器打开场景 UI 页时写回；运行时只读不强制写）

giveItem / shells 不再以 `ITEM_TOAST_JSON_KEY` 为权威来源；改为 `sceneUi.itemToast`。

---

## 4. 编辑器 UI

### 4.1 左侧导航

- Tab 文案：`获得提示` → **`场景 UI`**
- `UiSubSection`：由 `"itemToast"` 调整为 `"sceneUi"`（或保留内部 id、仅改 label——推荐内部 id 改为 `sceneUi`）
- 进入「场景 UI」后，中栏顶部或左侧二级：`获得提示` | `交互点悬停`

### 4.2 获得提示子页

- 复用现 `ItemToastEditorPanel` 逻辑，读写改为 `sceneUiJson` 的 `itemToast` 字段（读整包 → 改一段 → 写整包）
- 预览行为保持

### 4.3 交互点悬停子页

- FormRenderer 绑定 `hotspotHover`（字段对齐 `hotspot-schema` 中 hoverShadow 段，**无** useGlobal）
- 可选：右侧/下方简易预览（色块 + 示意双层参数），非必须

### 4.4 交互点属性面板

- Boolean：`hoverShadow.useGlobal`，标签「跟随全局悬停预设」，默认 true  
- `useGlobal !== false`：不渲染本地 glow/base 字段；显示短说明「由 界面 → 场景 UI → 交互点悬停 控制」  
- `useGlobal === false`：渲染现有本地层字段  

实现：`hotspotFields` 按 hotspot 当前值条件生成 children，或属性面板在 FormRenderer 外包一层条件。

---

## 5. 运行时

| 位置 | 改动 |
| --- | --- |
| `runtime-shell` / `player-shell` / `preview-shell` | Toast：读 `SceneUiConfig.itemToast`；不再依赖 backpack-hud `itemToastJson` 为唯一源（迁移回退可留在 readSceneUi 内） |
| `HotspotView` / `SceneView` | 注入或读取全局 `hotspotHover`；`buildHoverShadowFilter(resolveHotspotHoverShadow(hs, global))` |
| `editor` settings 声明 | 新增 `sceneUiJson: s.string(...).default("")` |
| `backpack-hud` | 保留 `itemToastJson` 声明一期（兼容）；可不在 UI 再写 |

预览壳与玩家壳均需能 `cross.get("editor", "sceneUiJson")`。

---

## 6. 验收

1. UI 显示「场景 UI」，内含获得提示 / 交互点悬停  
2. 改全局悬停后，跟随全局的交互点立即变化；`useGlobal: false` 的不受影响  
3. 获得提示配置写入 `editor.sceneUiJson`；运行时 giveItem Toast 使用该配置  
4. 仅有旧 `itemToastJson` 的工程，打开场景 UI 或首次读配置可迁入  
5. `npm run build` 通过  

---

## 7. 主要文件

| 文件 | 动作 |
| --- | --- |
| `src/domain/scene-ui-config.ts` | 新建 |
| `src/domain/types.ts` | `SceneUiConfig`；`HotspotHoverShadow.useGlobal?` |
| `src/domain/hover-shadow.ts` | normalize 保留 useGlobal；`resolveHotspotHoverShadow` 可放此或 scene-ui-config |
| `src/store/scene-ui-settings.ts` | 新建读写 + 迁移 |
| `src/modules/editor-extension.tsx` | 声明 `sceneUiJson` |
| `src/editor/ui/ui-editor-panel.tsx` | 场景 UI tab + 二级子页 |
| `src/editor/ui/item-toast-editor-panel.tsx` | 改读 sceneUi |
| `src/editor/ui/hotspot-hover-editor-panel.tsx` | 新建（或内联） |
| `src/schema/hotspot-schema.ts` / property-panel | useGlobal 条件字段 |
| `src/runtime/hotspot-view.tsx` + shells | resolve 全局悬停；Toast 读 sceneUi |
| `src/domain/serialize.ts` | hotspot normalize 带 useGlobal |
