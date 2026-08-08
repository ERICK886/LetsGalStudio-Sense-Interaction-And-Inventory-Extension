/**
 * index.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景交互系统扩展入口：声明 saveSchema / settings，并在 render 闭包中注入 save API。
 */

import {
  Extension,
  extension,
  defineSave,
  settings,
  type ExtensionRenderData,
  type SaveAPI,
} from "@avg-studio/sdk";
import {
  SceneInteractionApp,
  type SceneInteractionAppProps,
} from "./app/scene-interaction-app";
import {
  getItemCount,
  giveItem,
  hasItem,
} from "./methods/inventory-methods";
import {
  getCurrentSceneId,
  openScene,
  setEditMode,
  setHotspotVisible,
} from "./methods/scene-methods";
import type { SceneInteractionSaveMap } from "./store/save-types";

/**
 * 场景交互扩展模块。
 *
 * - saveSchema：库存 / 进度 / 编辑模式 / 当前场景（均为 slot）
 * - settings：Studio 项目设置（主题、场景库、物品库、HUD、编辑器尺寸等）
 * - render：通过闭包将 `this.save` 注入 SceneInteractionApp，供 React 树内读写存档
 *
 * @remarks
 * `extension.json.id`（`ext-27b96b`）是包/项目 id，与 `@extension` 的稳定子模块 id
 *（`scene-interaction`）不同，请勿混淆或擅自修改前者。
 */
@extension({ id: "scene-interaction", label: "场景交互" })
class SceneInteractionExtension extends Extension<SceneInteractionAppProps> {
  /**
   * 存档字段声明：JSON 字符串存复杂结构，boolean/string 存运行时状态。
   *
   * @see SceneInteractionSaveMap
   */
  static saveSchema = defineSave({
    inventoryJson: {
      type: "string",
      persistence: "slot",
      default: '{"entries":[]}',
      label: "库存 JSON",
    },
    progressJson: {
      type: "string",
      persistence: "slot",
      default: '{"consumed":{}}',
      label: "场景进度 JSON",
    },
    isEditMode: {
      type: "boolean",
      persistence: "slot",
      default: true,
      label: "编辑模式",
    },
    currentSceneId: {
      type: "string",
      persistence: "slot",
      default: "",
      label: "当前场景 ID",
    },
  });

  /** 剧本 methods：场景打开 / 编辑模式 / 当前场景 / 交互点可见性 */
  static openScene = openScene;
  static setEditMode = setEditMode;
  static getCurrentSceneId = getCurrentSceneId;
  static setHotspotVisible = setHotspotVisible;

  /** 剧本 methods：库存给予 / 查询 */
  static giveItem = giveItem;
  static hasItem = hasItem;
  static getItemCount = getItemCount;

  /**
   * 项目设置：在 Studio 项目设置面板中由创作者配置。
   *
   * @remarks
   * SDK：`s.enum(label, string[])` + `.labels()`；勿传 `{label,value}` 对象数组
   *（否则 Studio 设置面板会把对象当 React 子节点渲染 → React #31）。
   */
  static settings = settings((s) => ({
    allowEdit: s.boolean("允许编辑").default(true),
    theme: s
      .enum("界面主题", ["light", "dark"] as const)
      .labels({ light: "浅色", dark: "深色" })
      .default("dark"),
    defaultSceneId: s.string("默认场景 ID").default(""),
    scenesLibraryJson: s
      .string("场景库 JSON（自动维护）")
      .default('{"version":1,"scenes":[]}'),
    itemsLibraryJson: s
      .string("物品库 JSON（自动维护）")
      .default('{"version":1,"items":[]}'),
    inventoryHudMode: s
      .enum("物品栏显示模式", ["withScene", "always"] as const)
      .labels({ withScene: "跟随场景交互", always: "常驻 HUD" })
      .default("withScene"),
    inventoryHudJson: s.string("物品栏外观 JSON").default(""),
    editorLeftWidth: s
      .number("编辑器左栏宽度")
      .default(260)
      .range(180, 480),
    editorRightWidth: s
      .number("编辑器右栏宽度")
      .default(300)
      .range(220, 520),
    designWidth: s
      .number("设计分辨率宽度")
      .default(1920)
      .range(320, 7680),
    designHeight: s
      .number("设计分辨率高度")
      .default(1080)
      .range(320, 7680),
  }));

  /**
   * 渲染 UI 根组件。
   *
   * 必须返回稳定的 component 引用（不要在 render 里 new 匿名组件），
   * 否则 Studio 预览会反复 remount。
   *
   * @returns ExtensionRenderData，props 中注入 this.save
   */
  render(): ExtensionRenderData<SceneInteractionAppProps> {
    return {
      component: SceneInteractionApp,
      // 基类 this.save 在声明 saveSchema 后运行时可用；此处显式收窄供 App props
      props: {
        save: this.save as unknown as SaveAPI<SceneInteractionSaveMap>,
      },
    };
  }
}

export default SceneInteractionExtension;
