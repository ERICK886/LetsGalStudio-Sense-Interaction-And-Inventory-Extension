# LetsGal Studio 场景交互及物品栏系统

> 扩展包 ID：`ink.zenly.ext-27b96b`｜ 程序界面：`editor`、`scene-interaction`、`backpack-hud`、`backpack`  
> 扩展版本：`0.2.0` ｜ 需要 LetsGal Studio SDK：`>=1.9.2-beta`  
> 作者：池水三两升

这是一套**场景探索 + 物品栏**扩展：作者用内置编辑器配置多场景底图与交互点、物品库与合成配方；玩家在剧情里打开场景、点击交互点拿物品、看快捷栏与全屏背包。

本文面向**在 Studio 里使用本扩展的创作者**。程序源码在 `src/`，本地 SDK 在 `sdk/`（由 Studio 同步，请勿手改）。

## 目录

1. [这个扩展能做什么](#1-这个扩展能做什么)
2. [安装与构建](#2-安装与构建)
3. [程序模块一览](#3-程序模块一览)
4. [五分钟跑通：编辑 → 打开 → 捡物品](#4-五分钟跑通编辑--打开--捡物品)
5. [剧情方法（scene-interaction）](#5-剧情方法scene-interaction)
6. [背包 HUD / 全屏背包方法](#6-背包-hud--全屏背包方法)
7. [玩家存档与作者设置](#7-玩家存档与作者设置)
8. [快进（skip）与立即执行](#8-快进skip与立即执行)
9. [目录结构](#9-目录结构)
10. [自检清单](#10-自检清单)

## 1. 这个扩展能做什么

**可以：**

- 多场景底图 + 可点击交互图片（hotspot），支持悬浮阴影、一次性触发、可见性覆盖
- 交互点动作链：跳转场景、给予/移除物品、合成、跳转片段、继续剧情等
- 物品库与合成配方编辑（与场景编辑同属 `editor` 程序）
- 左侧快捷栏 HUD + 独立全屏背包（查看大图、合成）
- 剧本方法打开/关闭场景交互（可阻塞剧情，直到玩家退出）
- 玩家进度进 slot 存档：库存、场景进度、当前场景、返回栈

**要注意：**

- `extension.json.id`（`ink.zenly.ext-27b96b`）是**扩展包** id；剧本里调用方法时选的是子模块（如 `scene-interaction`）
- 库存写在 `scene-interaction` 的 `inventoryJson`；背包 HUD 通过进程内会话桥读取，勿另建第二份存档
- 可视化界面 JSON（若使用）放在 `ui/`，请用 Studio 可视化界面编辑器维护，不要手改随机文件名

## 2. 安装与构建

需要：Node.js、pnpm，以及 Studio SDK `>=1.9.2-beta`。

在扩展根目录执行：

```powershell
cd C:\Users\20231\Documents\AVG-Extensions\ext-27b96b
pnpm install
pnpm run build
```

开发时可用：

```powershell
pnpm run watch
```

Studio 加载 `extension.json` 里的 `entry`（`dist/index.mjs`）。  
改完代码后：先等 `build`/`watch` 完成，再在 Studio 里重载扩展或重启 Preview。

## 3. 程序模块一览

| 模块 id | 标签 | 用途 |
| --- | --- | --- |
| `editor` | 场景编辑器 | 作者工具：场景库 / 物品库 / 配方 / 设计分辨率与 UI 预设 |
| `scene-interaction` | 场景交互 | 玩家运行时：场景画布、阻塞会话、存档与大部分剧情方法 |
| `backpack-hud` | 背包HUD | 快捷栏（优先 Visual UI 穿透，失败回退 React） |
| `backpack` | （全屏背包） | 全屏背包界面 |

## 4. 五分钟跑通：编辑 → 打开 → 捡物品

### 第一步：打开场景编辑器

在 Studio 扩展树中打开本扩展的 **场景编辑器**（`editor`），新建场景、铺底图、拖交互点，在属性里加动作（例如 `giveItem`）。

在物品库里至少建一个物品，记下物品 id。

### 第二步：在剧情里打开场景交互（阻塞）

在玩家需要探索的那段剧情里加：**调用扩展方法 → 场景交互 → 打开场景交互（阻塞）**。

| 参数 | 建议 |
| --- | --- |
| 场景 ID/名称 | 填编辑器里的场景 id，或留空用默认/当前场景 |
| 压入返回栈 | 一般保持开启 |

该方法会显示场景 UI 并**卡住剧情**，直到玩家退出或调用「关闭场景交互」。

### 第三步：用剧本 Preview 试玩

跑**剧本 Preview**（不要只开扩展程序预览），点交互点拿物品，看左侧快捷栏是否出现。  
调试器「内部 → 场景交互系统」里的 `inventoryJson` 应随给予物品更新（不是空的 `{"entries":[]}`）。

## 5. 剧情方法（scene-interaction）

SDK `method().run` 无返回值；成功/失败或查询结果通过可选 **`resultVariable`** / **`targetVariable`** 写入剧本变量。

| 方法 id | 作用 | 正常播放 | 快进 |
| --- | --- | --- | --- |
| `open-scene` | 写场景 id / 返回栈并 show UI（不阻塞） | show | **不可跳过**（走 run） |
| `open-scene-interaction` | show modal 并阻塞至关闭 | show + await | **不可跳过**（走 run） |
| `close-scene-interaction` | hide UI + 解门闩 | hide | 只解门闩，不 hide |
| `set-edit-mode` | 写 `isEditMode` 并 show/hide 编辑器 | show/hide | 走 run |
| `get-current-scene-id` | 读当前场景 id | 写变量 | 同 run |
| `set-hotspot-visible` | 写进度可见性 | 写档 | 同 run |
| `give-item` | 发放物品 | 写 `inventoryJson` | 同 run（无 UI） |
| `has-item` / `get-item-count` | 查询库存 | 写变量 | 同 run |
| `craft-recipe` | 按配方合成 | 写档 | 同 run |

调用路径示例（在「调用扩展方法」里选模块即可，不必手写）：

```text
ink.zenly.ext-27b96b / scene-interaction / open-scene-interaction
```

## 6. 背包 HUD / 全屏背包方法

| 模块 | 方法 id | 作用 | 快进 |
| --- | --- | --- | --- |
| `backpack-hud` | `open-backpack-hud` | 打开快捷栏 | **不可跳过**（走 run） |
| `backpack-hud` | `close-backpack-hud` | 关闭快捷栏 | 跳过 UI |
| `backpack` | `open-backpack` | 打开全屏背包 | **不可跳过**（走 run） |
| `backpack` | `close-backpack` | 关闭全屏背包 | 跳过 UI |

场景交互打开后，运行时通常会自行叠快捷栏；也可在剧情里单独调用上述方法。

## 7. 玩家存档与作者设置

### 玩家存档（`scene-interaction` saveSchema，slot）

| 字段 | 说明 |
| --- | --- |
| `inventoryJson` | 库存 |
| `progressJson` | 交互点消耗 / 可见性等 |
| `currentSceneId` | 当前场景 |
| `sceneReturnStackJson` | 场景返回栈 |
| `isEditMode` | 兼容旧剧本的编辑开关 |

磁盘落档仍依赖引擎的存档 / 快速存档；Studio「自动保存」指工程保存，不等于玩家 slot。

### 作者设置（`editor` settings）

| 键 | 说明 |
| --- | --- |
| `scenesLibraryJson` / `itemsLibraryJson` / `recipesLibraryJson` | 作者库（编辑器维护） |
| `defaultSceneId` | 默认场景 |
| `designWidth` / `designHeight` | 设计分辨率 |
| `theme` | 编辑器主题 |
| `sceneUiJson` | 场景 UI 预设（获得提示、悬停等） |
| `allowEdit` | 是否允许编辑 |

## 8. 快进（skip）与立即执行

- **打开类**（打开场景 / 阻塞会话 / 打开背包与 HUD / 打开编辑器）：**不提供 `skip`**，引擎 fallback 到 `run`，并退出快进状态，避免玩家跳过必须交互的界面。
- **关闭类 / 纯写档查询**：提供 `skip` / `runImmediately`，只落副作用、不 show/hide UI。
- `runImmediately`：需要副作用立刻发生、不等动画时由引擎调用；打开类也只写档、不 show。

## 9. 目录结构

```text
src/
  index.tsx              扩展入口（导出四个 Extension + Studio 内联卡片）
  modules/               editor / scene-interaction / backpack-hud / backpack
  app/                   各程序 React 根
  domain/                场景、物品、库存、动作、布局等纯逻辑
  editor/                作者编辑器壳与画布
  runtime/               玩家场景壳、动作运行时、HUD、Toast
  methods/               剧本 method 实现
  schema/                属性表单
  store/                 settings / save / 会话桥
  backpack/              全屏背包与 HUD Shell
  theme/                 主题 tokens
  shared/                模块 id、日志、坐标等
extension.json           manifest：id / 版本 / entry / sdkVersion
vite.config.ts           lib 模式 ESM → dist/index.mjs
sdk/                     @avg-studio/sdk（Studio 同步，勿手改）
ui/                      可视化界面（若有；用 Studio 编辑器维护）
dist/                    构建产物（勿手改）
```

## 10. 自检清单

- [ ] `pnpm install` 与 `pnpm run build` 成功，Studio 能加载本扩展
- [ ] 编辑器里能新建场景、物品，并保存到项目设置
- [ ] 剧本 Preview 调用「打开场景交互（阻塞）」后能看到场景，快进无法跳过该步
- [ ] 点击 `giveItem` 交互点后，调试器 `inventoryJson` 有条目，快捷栏可见
- [ ] 打开全屏背包能看到同一份库存
- [ ] 关闭场景交互后剧情继续

## 更新说明

- **0.2.0**：多模块拆分（编辑器 / 运行时 / HUD / 全屏背包）、阻塞会话、库存会话桥、打开类方法不可快进跳过。
