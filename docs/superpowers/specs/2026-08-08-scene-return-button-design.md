/**
 * 2026-08-08-scene-return-button-design.md
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 1.0.0
 *
 * 场景返回栈 + 场景 UI「返回场景」完整浮层按钮。
 */

# 场景返回按钮（多级栈）— 设计规格

- **状态**: 待用户审阅
- **包**: `ext-27b96b`
- **相关**: 场景 UI 预设 `2026-08-08-scene-ui-presets-design.md`；打开场景 method / `openScene` 动作

## 1. 背景与决策

### 1.1 现状

- 打开场景：动作 `openScene` 与剧本 `openScene` / `openSceneInteraction` 仅写 `save.currentSceneId`
- 工程有 `defaultSceneId`（无参打开时的回退），**无**场景返回栈
- 场景 UI（`editor.sceneUiJson`）仅有：获得提示、交互点悬停
- 预览使用 settings 沙箱存档，与玩家槽位隔离

### 1.2 已确认方向

| 项 | 选择 |
| --- | --- |
| 主场景语义 | 打开/预览时**临时**建立返回关系（非单独永久「主场景」设置） |
| 入栈 | 默认压入打开前的当前场景；可手动指定 `returnTarget` 覆盖 |
| 栈深度 | **多级栈**；可连续返回 C→B→A |
| 点击行为 | **逐级 pop**（一次一层） |
| UI | 场景 UI 分区完整浮层控件（位置/尺寸/图/文/悬停） |
| 持久化 | **玩家存档写栈**；**预览沙箱可重置**，与玩家策略分离 |
| 实现路径 | 存档栈 + Scene UI 浮层（方案 1） |

### 1.3 非目标（一期）

- 按场景覆盖返回按钮样式
- 多套命名预设 / 导入导出
- 返回过场动画
- 场景 UI 内完整可视化拖拽画布（一期表单编辑 x/y/w/h）
- 将返回做成必须放置的交互点（热点方案排除）
- 改变 `defaultSceneId` 语义（仍只服务无参打开回退）

---

## 2. 数据模型

### 2.1 存档：返回栈

`SceneInteractionSaveMap` 新增：

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `sceneReturnStackJson` | `string` | `"[]"` | JSON 数组，元素为场景 **id**；**栈顶** = 最近一层返回目标 |

```ts
type SceneReturnStack = string[]; // ids, top = last element
```

规范化规则：

- 非法 JSON / 非数组 → `[]`
- 元素须为非空字符串；否则丢弃
- 写入前可做「连续相同栈顶不重复压入」

预览沙箱同样声明该字段；进入运行预览时默认置 `[]`（可重置）。可选预览入口「初始返回目标」预置一层，便于测子场景。

### 2.2 打开场景动作

```ts
{
  type: "openScene";
  sceneIdOrName: string;
  /** 缺省：自动压入打开前的 currentSceneId */
  returnTarget?: string;
  /** 默认 true；false = 只切场景、不改栈 */
  pushReturn?: boolean;
}
```

剧本 method `openScene` / `openSceneInteraction` 同步可选参数：`returnTarget`、`pushReturn`（schema 增加对应字段）。

序列化：旧存档缺省字段时 `pushReturn` 视为 `true`，`returnTarget` 视为未指定。

### 2.3 场景 UI：`sceneReturn` 段

扩展 `SceneUiConfig`（`version` 仍为 `1`；缺省段用默认值补齐）：

```ts
interface SceneReturnButtonConfig {
  /** 总开关；false 时永不显示 */
  enabled: boolean;
  /** 设计分辨率下的矩形（与背包等一致用 UiRect） */
  rect: UiRect; // x, y, w, h
  /** 按钮文案 */
  label: string;
  /** 常态：盒 + 字 */
  style: UiBoxStyle & UiTextStyle;
  /** 可选背景/图标 */
  imageSrc?: string;
  /** 悬停态（可选） */
  hoverStyle?: Partial<UiBoxStyle & UiTextStyle>;
  hoverImageSrc?: string;
}

interface SceneUiConfig {
  version: 1;
  itemToast: ItemToastConfig;
  hotspotHover: HotspotHoverShadow;
  sceneReturn: SceneReturnButtonConfig;
}
```

默认建议（可在实现时微调数值）：

- `enabled: true`
- `rect`: 左上角附近，如 `{ x: 24, y: 24, w: 120, h: 48 }`
- `label: "返回"`
- `style`: 可读的默认底/边/字色

读写仍经 `readSceneUiConfig` / `writeSceneUiConfig`；normalize 时若缺 `sceneReturn` 则填默认，不破坏旧 `itemToast` / `hotspotHover`。

---

## 3. 打开 / 入栈 / 返回规则

### 3.1 统一入口伪代码

```
openSceneWithReturn(target, { returnTarget?, pushReturn = true }):
  1. 解析 target → scene；失败则不改栈、不切场景
  2. fromId = 当前 currentSceneId
  3. 若 pushReturn === true：
       pushId = 解析(returnTarget) 若有，否则 fromId
       若 pushId 有效且 ≠ scene.id：
         若栈顶 !== pushId → push(pushId)
  4. set currentSceneId = scene.id
```

动作运行时（`createActionRuntime.openScene`）与剧本 method **共用**同一领域函数（建议放 `domain/scene-return-stack.ts`），避免双份逻辑。

### 3.2 行为表

| 情况 | 行为 |
| --- | --- |
| A 打开 B（默认） | 压入 A，当前 = B |
| A 打开 B，returnTarget=C | 压入 C，当前 = B |
| A 打开 B，pushReturn=false | 不压栈，只切到 B |
| 目标场景 = 当前场景 | 不压栈、不重复 set（或 set 同 id 无害） |
| 栈 [A,B]，在 C 点返回 | pop→B；再点→A；栈空隐藏按钮 |
| pop 出的 id 已从库删除 | 丢弃该层并继续 pop，直到有效或栈空；皆无效则不切场景 |
| `closeSceneInteraction` / 退出玩家会话 | **不自动清栈**（玩家存档保留） |
| 进入编辑器运行预览 | 沙箱栈默认 `[]`（可重置）；可选预置一层 |

### 3.3 显示条件

同时满足才渲染返回按钮：

1. `sceneReturn.enabled === true`
2. 栈非空
3. 经「跳过无效 id」后的有效栈顶 ≠ 当前场景 id

### 3.4 点击返回

1. 循环 pop 直到得到库中存在的场景 id，或栈空
2. 若得到有效 id → `setCurrentSceneId` 并写回栈
3. 栈空且无有效目标 → 仅隐藏按钮

---

## 4. 编辑器与运行时

### 4.1 场景 UI 分区

- `UiEditorPanel` 场景 UI 二级页新增：**返回场景**
- 新面板 `SceneReturnEditorPanel`：读写 `sceneUiJson.sceneReturn`
- 表单字段：enabled、rect、label、style、imageSrc、hoverStyle、hoverImageSrc
- 一期不做完整拖拽画布

### 4.2 动作列表

「打开场景」增加：

- 复选：**压入返回栈**（默认开）→ `pushReturn`
- 可选：**返回目标**（场景下拉，空 = 用来源场景）→ `returnTarget`

### 4.3 运行时浮层

- 组件 `SceneReturnButton`，叠在 `SceneView` 之上
- 三壳共用：`RuntimeShell` / `PlayerShell` / `PreviewShell`
- 坐标经 `scene-layout` 按设计分辨率缩放
- 悬停切换 hover 样式/图；无图则纯样式
- 仅按钮矩形可点，不拦截其外热区

### 4.4 存档 schema

- `index.tsx` / `defineSave`（及模块声明处）增加 `sceneReturnStackJson`
- `notifySaveField("sceneReturnStackJson")` 与现有字段一致

---

## 5. 错误处理与边界

| 边界 | 处理 |
| --- | --- |
| openScene 目标不存在 | 不改栈、不切场景；warn / method 写 result false |
| returnTarget 解析失败 | 回退为 fromId；fromId 也空则不压栈 |
| 栈损坏 JSON | 视为 `[]` |
| 场景库删除栈中 id | 返回时跳过；打开时不主动清洗全栈（惰性） |
| sceneReturn 段缺失 | normalize 补默认 |

---

## 6. 测试 / 验收

1. A→B→C 可逐级返回至 A，栈空后按钮消失  
2. `returnTarget` / `pushReturn: false` 行为符合 §3.2  
3. 场景 UI 改位置/图/悬停后，预览与玩家表现一致  
4. 玩家存档：切场景后保存再读档，栈仍可返回  
5. 预览：重新进入运行预览时栈为空（未预置时）  
6. 旧工程无 `sceneReturn` / 无栈字段时，打开与 UI 不报错  

---

## 7. 主要触点文件（实现时）

| 区域 | 文件（预期） |
| --- | --- |
| 领域 | `scene-return-stack.ts`、`scene-ui-config.ts`、`types.ts`、`actions.ts`、`serialize.ts` |
| 存档 | `save-types.ts`、`index.tsx`、模块 save 声明 |
| 运行时 | `create-action-runtime.ts`、`scene-return-button.tsx`、三壳、`scene-view` 或壳层挂载 |
| 编辑器 | `ui-editor-panel.tsx`、`scene-return-editor-panel.tsx`、`action-list-field.tsx` |
| Method | `scene-methods.ts` |
| 文档 | 本 spec；实现计划另见 `docs/superpowers/plans/` |
