/**
 * passthrough-show-options.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 扩展叠层「点击穿透」容器选项。
 *
 * 分工：
 * - 程序 UI（scene-interaction）：只用 `interactable: false` + 壳内
 *   `pointer-events: none` / 控件 `auto`。**不要**传
 *   `pointerEventsPassthrough`——该选项按 Visual UI 元素矩形命中；
 *   React 树没有 ref 元素时会被宿主当成整层不可交互，悬停/点击全失效。
 * - Visual UI（inventory-hud 等）：用 `pointerEventsPassthrough: true`。
 */

import type { UIShowOptions, VisualUIOpenOptions } from "@avg-studio/sdk";

/**
 * 场景交互全屏宿主（程序 UI / 玩家运行时）。
 *
 * `interactable: false`：宿主根层不抢空白区指针，便于对话框点击穿透。
 * 交互点 / 返回 / 退出仍靠壳内 `pointer-events: none` + 控件 `auto`
 *（有图交互点仅剪影命中时 auto，见 hotspot-view）。
 */
export const SCENE_PASSTHROUGH_SHOW_OPTIONS: UIShowOptions = {
  size: "(100%, 100%)",
  position: "(0, 0)",
  interactable: false,
};

/**
 * 可视化快捷栏 HUD 打开选项（全屏画布 + 根层穿透）。
 *
 * @remarks
 * `modal` 必须为 false，否则宿主会强制关闭穿透并阻塞剧本。
 */
export const VISUAL_INVENTORY_HUD_OPEN_OPTIONS: VisualUIOpenOptions = {
  size: "(100%, 100%)",
  position: "(0, 0)",
  interactable: true,
  modal: false,
  pointerEventsPassthrough: true,
};

/**
 * 可视化全屏背包：全屏可交互，不穿透。
 */
export const VISUAL_BACKPACK_OPEN_OPTIONS: VisualUIOpenOptions = {
  size: "(100%, 100%)",
  position: "(0, 0)",
  interactable: true,
  modal: false,
  pointerEventsPassthrough: false,
};
