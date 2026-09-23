/**
 * backpack-hud-extension.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.5.0
 *
 * 快捷栏 HUD 程序：`@extension({ id: "backpack-hud" })`。
 * 玩家侧优先 `ui/inventory-hud.json`（Visual UI + 穿透）；
 * React HudShell 作编辑器预览与 Visual 打开失败时的回退。
 * 全屏背包见独立程序 `backpack`。
 */

import {
  Extension,
  extension,
  settings,
  type ExtensionContext,
  type ExtensionRenderData,
} from "@avg-studio/sdk";
import {
  BackpackHudApp,
  type BackpackHudAppProps,
} from "../app/backpack-hud-app";
import {
  closeBackpackHud,
  openBackpackHud,
} from "../methods/backpack-methods";
import { registerVisualInventoryHud } from "../runtime/visual-inventory-hud";
import { BACKPACK_HUD_MODULE_ID } from "../shared/module-ids";

/**
 * 快捷栏 HUD 模块。
 *
 * - settings：HUD 外观 JSON（扩展内画布编辑；与 Visual UI 布局可分别维护）
 * - methods：显示 / 关闭 HUD
 * - onRegister：挂接 Visual HUD 控制器
 * - render：BackpackHudApp → HudShell（预览 / 回退）
 */
@extension({ id: BACKPACK_HUD_MODULE_ID, label: "背包HUD" })
export class BackpackHudExtension extends Extension<BackpackHudAppProps> {
  static settings = settings((s) => ({
    inventoryHudJson: s.string("物品栏外观 JSON").default(""),
    autoShowHud: s.boolean("场景交互时自动显示背包快捷栏").default(true),
    itemToastJson: s.string("获得物品提示 JSON").default(""),
  }));

  static openBackpackHud = openBackpackHud;
  static closeBackpackHud = closeBackpackHud;

  /**
   * 注册 Visual HUD：打开时同步库存并绑定点击。
   *
   * @param ctx - 扩展上下文
   */
  static onRegister(ctx: ExtensionContext): void {
    registerVisualInventoryHud(ctx);
  }

  /**
   * @returns ExtensionRenderData
   */
  render(): ExtensionRenderData<BackpackHudAppProps> {
    return {
      component: BackpackHudApp,
      props: {},
    };
  }
}
