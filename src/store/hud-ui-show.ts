/**
 * hud-ui-show.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 快捷栏 HUD 的 React `ctx.ui.show` 回退策略（Visual UI 失败时使用）：
 * 1. size/position 收束为设计包围盒（非全屏）
 * 2. interactable: false — 宿主根层不抢指针
 * 3. 槽位/按钮在组件内 pointer-events: auto
 *
 * 玩家主路径见 `runtime/visual-inventory-hud.ts`（pointerEventsPassthrough）。
 */

import type { ExtensionContext } from "@avg-studio/sdk";
import {
  DEFAULT_DESIGN_HEIGHT,
  DEFAULT_DESIGN_WIDTH,
  normalizeDesignSize,
  SETTINGS_DESIGN_HEIGHT,
  SETTINGS_DESIGN_WIDTH,
} from "../domain/design-resolution";
import {
  computeHudAxisAlignedBounds,
  resolveHudLayout,
  type ResolvedHudLayout,
} from "../domain/hud-layout";
import { parseInventoryHudJson } from "../domain/serialize";
import { readAuthorSetting } from "./author-settings";
import { INVENTORY_HUD_JSON_KEY, readHudSetting } from "./hud-settings";

/**
 * `ctx.ui.show` 容器选项（与 SDK UIShowOptions 对齐的字面量）。
 */
export interface HudUiShowOptions {
  size: string;
  position: string;
  interactable: boolean;
}

/** 全屏可交互（打开全屏背包 / 详情时临时放大宿主） */
export const BACKPACK_HUD_FULLSCREEN_SHOW_OPTIONS: HudUiShowOptions = {
  size: "(100%, 100%)",
  position: "(0, 0)",
  interactable: true,
};

/**
 * 全屏不可交互宿主：HudShell 内 letterbox，空白穿透到场景 / 对话框。
 * 玩家快捷栏推荐路径（与 SceneView 设计坐标对齐）。
 */
export const BACKPACK_HUD_LETTERBOX_SHOW_OPTIONS: HudUiShowOptions = {
  size: "(100%, 100%)",
  position: "(0, 0)",
  interactable: false,
};

/**
 * 读取设计分辨率（作者 settings）。
 *
 * @param ctx - 扩展上下文
 * @returns 设计宽高
 */
function readDesignSize(ctx: ExtensionContext): {
  width: number;
  height: number;
} {
  return normalizeDesignSize(
    Number(readAuthorSetting(ctx, SETTINGS_DESIGN_WIDTH)),
    Number(readAuthorSetting(ctx, SETTINGS_DESIGN_HEIGHT)),
  );
}

/**
 * 读取并解析当前快捷栏布局。
 *
 * @param ctx - 扩展上下文
 * @returns ResolvedHudLayout
 */
export function readResolvedHudLayout(ctx: ExtensionContext): ResolvedHudLayout {
  const design = readDesignSize(ctx);
  const raw = readHudSetting(ctx, INVENTORY_HUD_JSON_KEY);
  const json = typeof raw === "string" ? raw : "";
  const cfg = parseInventoryHudJson(json, design.width, design.height);

  return resolveHudLayout(cfg);
}

/**
 * 将布局包围盒转为相对设计画幅的 % 容器选项（仅覆盖 HUD 区域）。
 *
 * @param layout - 已解析 HUD 布局
 * @param designWidth - 设计宽；缺省 1920
 * @param designHeight - 设计高；缺省 1080
 * @returns ui.show options
 *
 * @example
 * ```ts
 * await ctx.ui.show("backpack-hud", { compactHost: true }, buildTightHudShowOptions(layout, 1920, 1080));
 * ```
 */
export function buildTightHudShowOptions(
  layout: ResolvedHudLayout,
  designWidth: number = DEFAULT_DESIGN_WIDTH,
  designHeight: number = DEFAULT_DESIGN_HEIGHT,
): HudUiShowOptions {
  const bounds = computeHudAxisAlignedBounds(layout);
  const dw = Math.max(1, designWidth);
  const dh = Math.max(1, designHeight);

  const xPct = (bounds.x / dw) * 100;
  const yPct = (bounds.y / dh) * 100;
  const wPct = (bounds.w / dw) * 100;
  const hPct = (bounds.h / dh) * 100;

  const fmt = (n: number): string => {
    const r = Math.round(n * 1000) / 1000;

    return String(r);
  };

  return {
    size: `(${fmt(wPct)}%, ${fmt(hPct)}%)`,
    position: `(${fmt(xPct)}%, ${fmt(yPct)}%)`,
    /**
     * 根层不接管指针；仅子树里 pointer-events:auto 的控件可点，
     * 宿主空白穿透到下层对话框 / 场景。
     */
    interactable: false,
  };
}

/**
 * 从当前 settings 生成紧凑 HUD 的 ui.show 选项。
 *
 * @param ctx - 扩展上下文
 * @returns ui.show options
 */
export function getTightBackpackHudShowOptions(
  ctx: ExtensionContext,
): HudUiShowOptions {
  const layout = readResolvedHudLayout(ctx);
  const design = readDesignSize(ctx);

  return buildTightHudShowOptions(layout, design.width, design.height);
}
