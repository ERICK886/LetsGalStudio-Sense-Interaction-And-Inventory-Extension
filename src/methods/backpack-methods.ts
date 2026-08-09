/**
 * backpack-methods.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.5.2
 *
 * 快捷栏 HUD 剧本方法：优先打开可视化界面（pointerEventsPassthrough），
 * 失败时回退 React `backpack-hud` 紧凑包围盒。
 * open：不声明 skip → 快进 fallback run（不可跳过打开）。
 * close.runImmediately / close.skip：不 hide（无存档副作用）。
 * 全屏背包见 `backpack-screen-methods`。
 */

import { method, type ExtensionContext } from "@avg-studio/sdk";
import {
  closeVisualInventoryHud,
  openInventoryHudPreferVisual,
} from "../runtime/visual-inventory-hud";
import { BACKPACK_HUD_MODULE_ID } from "../shared/module-ids";
import { logError } from "../shared/logger";
import { getTightBackpackHudShowOptions } from "../store/hud-ui-show";

/** 与 @extension id 一致（React 回退路径） */
export const BACKPACK_HUD_UI_ID = BACKPACK_HUD_MODULE_ID;

/**
 * @param ctx - 上下文
 * @param resultVariable - 可选变量名
 * @param ok - 结果
 */
function writeResult(
  ctx: ExtensionContext,
  resultVariable: string | undefined,
  ok: boolean,
): void {
  const name = resultVariable?.trim();

  if (name) {
    ctx.variables.set(name, ok);
  }
}

/**
 * 打开 UI 前退出快进。
 *
 * @param ctx - 扩展上下文
 */
function exitPlayerSkipMode(ctx: ExtensionContext): void {
  try {
    ctx.dialogue.setSkipMode(false);
  } catch {
    // 忽略
  }
}

/**
 * React 紧凑 HUD 回退打开。
 *
 * @param ctx - 扩展上下文
 */
async function showReactHudFallback(ctx: ExtensionContext): Promise<void> {
  await ctx.ui.show(
    BACKPACK_HUD_UI_ID,
    { compactHost: true },
    getTightBackpackHudShowOptions(ctx),
  );
}

/**
 * 立即执行 / 关闭快进：不碰 UI。
 *
 * @param ctx - 上下文
 * @param params - 方法参数
 */
function skipCloseHudUi(
  ctx: ExtensionContext,
  params: { resultVariable?: string },
): void {
  writeResult(ctx, params.resultVariable, true);
}

/**
 * 显示快捷栏 HUD（优先 Visual UI + 穿透）。
 *
 * @param params.resultVariable - 可选结果变量
 */
export const openBackpackHud = method({
  id: "open-backpack-hud",
  title: "打开背包HUD",
  description: "show HUD；不声明 skip，快进走 run（不可跳过）",
  schema: {
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    exitPlayerSkipMode(ctx);

    try {
      await openInventoryHudPreferVisual(ctx, () =>
        showReactHudFallback(ctx),
      );
      writeResult(ctx, params.resultVariable, true);
    } catch (err) {
      logError("backpack-methods", "openBackpackHud 失败", err);
      writeResult(ctx, params.resultVariable, false);
    }
  },
  runImmediately: skipCloseHudUi,
});

/**
 * 隐藏快捷栏 HUD（Visual + React 都尝试关）。
 *
 * @param params.resultVariable - 可选结果变量
 */
export const closeBackpackHud = method({
  id: "close-backpack-hud",
  title: "关闭背包HUD",
  description: "正常播放 hide HUD；快进跳过 UI",
  schema: {
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    try {
      closeVisualInventoryHud(ctx);

      try {
        await ctx.ui.hide(BACKPACK_HUD_UI_ID);
      } catch {
        // React HUD 可能未打开
      }

      writeResult(ctx, params.resultVariable, true);
    } catch (err) {
      logError("backpack-methods", "closeBackpackHud 失败", err);
      writeResult(ctx, params.resultVariable, false);
    }
  },
  runImmediately: skipCloseHudUi,
  skip: skipCloseHudUi,
});
