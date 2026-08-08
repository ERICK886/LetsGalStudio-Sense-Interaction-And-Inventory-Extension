/**
 * backpack-methods.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 背包 HUD 剧本方法：显示/隐藏 HUD 层、打开全屏背包。
 */

import { method, type ExtensionContext } from "@avg-studio/sdk";
import { BACKPACK_HUD_MODULE_ID } from "../shared/module-ids";
import { logError } from "../shared/logger";
import { requestOpenBackpack } from "../store/backpack-ui-session";

/** 与 @extension id 一致 */
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
 * 显示背包 HUD（快捷栏常驻层）。
 *
 * @param params.resultVariable - 可选结果变量
 */
export const openBackpackHud = method({
  id: "open-backpack-hud",
  title: "打开背包HUD",
  schema: {
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    try {
      await ctx.ui.show(
        BACKPACK_HUD_UI_ID,
        {},
        {
          size: "(100%, 100%)",
          position: "(0, 0)",
          interactable: true,
        },
      );
      writeResult(ctx, params.resultVariable, true);
    } catch (err) {
      logError("backpack-methods", "openBackpackHud 失败", err);
      writeResult(ctx, params.resultVariable, false);
    }
  },
});

/**
 * 隐藏背包 HUD。
 *
 * @param params.resultVariable - 可选结果变量
 */
export const closeBackpackHud = method({
  id: "close-backpack-hud",
  title: "关闭背包HUD",
  schema: {
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    try {
      await ctx.ui.hide(BACKPACK_HUD_UI_ID);
      writeResult(ctx, params.resultVariable, true);
    } catch (err) {
      logError("backpack-methods", "closeBackpackHud 失败", err);
      writeResult(ctx, params.resultVariable, false);
    }
  },
});

/**
 * 显示 HUD 并打开全屏背包。
 *
 * @param params.resultVariable - 可选结果变量
 */
export const openBackpack = method({
  id: "open-backpack",
  title: "打开全屏背包",
  schema: {
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    try {
      await ctx.ui.show(
        BACKPACK_HUD_UI_ID,
        { openBackpack: true },
        {
          size: "(100%, 100%)",
          position: "(0, 0)",
          interactable: true,
        },
      );
      /**
       * HUD 若已挂载，show 可能不重渲染；再发一次会话事件确保打开全屏。
       */
      requestOpenBackpack();
      writeResult(ctx, params.resultVariable, true);
    } catch (err) {
      logError("backpack-methods", "openBackpack 失败", err);
      writeResult(ctx, params.resultVariable, false);
    }
  },
});
