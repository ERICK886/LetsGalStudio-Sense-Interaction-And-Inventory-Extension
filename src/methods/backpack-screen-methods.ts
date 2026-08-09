/**
 * backpack-screen-methods.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.2
 *
 * 全屏背包程序（`backpack`）的剧本方法：打开 / 关闭。
 * open：不声明 skip → 快进 fallback run（不可跳过打开）。
 * close.runImmediately / close.skip：不 hide。
 */

import { method, type ExtensionContext } from "@avg-studio/sdk";
import { BACKPACK_MODULE_ID } from "../shared/module-ids";
import { logError } from "../shared/logger";
import { BACKPACK_HUD_FULLSCREEN_SHOW_OPTIONS } from "../store/hud-ui-show";

/** 与 @extension id 一致 */
export const BACKPACK_UI_ID = BACKPACK_MODULE_ID;

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
 * 立即执行 / 关闭快进：不碰 UI。
 *
 * @param ctx - 上下文
 * @param params - 方法参数
 */
function skipCloseBackpackUi(
  ctx: ExtensionContext,
  params: { resultVariable?: string },
): void {
  writeResult(ctx, params.resultVariable, true);
}

/**
 * 打开全屏背包程序。
 *
 * @param params.resultVariable - 可选结果变量
 */
export const openBackpack = method({
  id: "open-backpack",
  title: "打开全屏背包",
  description: "show 全屏背包；不声明 skip，快进走 run（不可跳过）",
  schema: {
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    exitPlayerSkipMode(ctx);

    try {
      await ctx.ui.show(
        BACKPACK_UI_ID,
        {},
        { ...BACKPACK_HUD_FULLSCREEN_SHOW_OPTIONS },
      );
      writeResult(ctx, params.resultVariable, true);
    } catch (err) {
      logError("backpack-screen-methods", "openBackpack 失败", err);
      writeResult(ctx, params.resultVariable, false);
    }
  },
  runImmediately: skipCloseBackpackUi,
});

/**
 * 关闭全屏背包程序。
 *
 * @param params.resultVariable - 可选结果变量
 */
export const closeBackpack = method({
  id: "close-backpack",
  title: "关闭全屏背包",
  description: "正常播放 hide；快进跳过 UI",
  schema: {
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    try {
      await ctx.ui.hide(BACKPACK_UI_ID);
      writeResult(ctx, params.resultVariable, true);
    } catch (err) {
      logError("backpack-screen-methods", "closeBackpack 失败", err);
      writeResult(ctx, params.resultVariable, false);
    }
  },
  runImmediately: skipCloseBackpackUi,
  skip: skipCloseBackpackUi,
});
