/**
 * backpack-extension.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 全屏背包程序：`@extension({ id: "backpack" })`。
 * 与快捷栏 HUD（backpack-hud）分离；库存经会话桥接 scene-interaction save。
 */

import {
  Extension,
  extension,
  settings,
  type ExtensionRenderData,
} from "@avg-studio/sdk";
import {
  BackpackApp,
  type BackpackAppProps,
} from "../app/backpack-app";
import {
  closeBackpack,
  openBackpack,
} from "../methods/backpack-screen-methods";
import { BACKPACK_MODULE_ID } from "../shared/module-ids";

/**
 * 全屏背包模块。
 *
 * - settings：背包界面 JSON
 * - methods：打开 / 关闭全屏背包
 * - render：BackpackApp
 */
@extension({ id: BACKPACK_MODULE_ID, label: "背包" })
export class BackpackExtension extends Extension<BackpackAppProps> {
  static settings = settings((s) => ({
    backpackScreenJson: s.string("全屏背包布局 JSON").default(""),
  }));

  static openBackpack = openBackpack;
  static closeBackpack = closeBackpack;

  /**
   * @returns ExtensionRenderData
   */
  render(): ExtensionRenderData<BackpackAppProps> {
    return {
      component: BackpackApp,
      props: {},
    };
  }
}
