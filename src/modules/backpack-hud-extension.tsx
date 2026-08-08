/**
 * backpack-hud-extension.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 背包 HUD 程序：`@extension({ id: "backpack-hud" })`。
 * 常驻快捷栏 + 全屏背包；库存真源在 scene-interaction save（会话桥接）。
 */

import {
  Extension,
  extension,
  settings,
  type ExtensionRenderData,
} from "@avg-studio/sdk";
import {
  BackpackHudApp,
  type BackpackHudAppProps,
} from "../app/backpack-hud-app";
import {
  closeBackpackHud,
  openBackpack,
  openBackpackHud,
} from "../methods/backpack-methods";
import { BACKPACK_HUD_MODULE_ID } from "../shared/module-ids";

/**
 * 背包 / 快捷栏 HUD 模块。
 *
 * - settings：HUD 外观 JSON
 * - methods：显示 HUD / 打开全屏背包 / 关闭
 * - render：BackpackHudApp（透明层，不挡场景）
 */
@extension({ id: BACKPACK_HUD_MODULE_ID, label: "背包HUD" })
export class BackpackHudExtension extends Extension<BackpackHudAppProps> {
  static settings = settings((s) => ({
    inventoryHudJson: s.string("物品栏外观 JSON").default(""),
    itemToastJson: s.string("获得物品提示 JSON").default(""),
  }));

  static openBackpackHud = openBackpackHud;
  static closeBackpackHud = closeBackpackHud;
  static openBackpack = openBackpack;

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
