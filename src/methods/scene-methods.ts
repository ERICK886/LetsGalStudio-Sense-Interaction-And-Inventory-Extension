/**
 * scene-methods.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 场景交互扩展剧本 methods：打开场景、阻塞玩家会话、编辑模式、当前场景 id、交互点可见性。
 * SDK method().run 无返回值；成功/失败可通过可选 resultVariable 写入剧本变量。
 *
 * 作者端场景库一律从 settings.scenesLibraryJson 读取；进度 / 当前场景走 save。
 */

import { method, type ExtensionContext, type SaveAPI } from "@avg-studio/sdk";
import { setHotspotVisibility } from "../domain/progress";
import { findScene } from "../domain/scene-registry";
import {
  parseProgressJson,
  parseScenesLibraryJson,
  stringifyProgress,
} from "../domain/serialize";
import type { ScenesLibraryFile } from "../domain/types";
import {
  beginPlayerSessionWait,
  endPlayerSessionWait,
} from "../runtime/player-session";
import {
  EDITOR_MODULE_ID,
  SCENE_INTERACTION_MODULE_ID,
} from "../shared/module-ids";
import { logError } from "../shared/logger";
import { readAuthorSetting } from "../store/author-settings";
import { readScenesLibraryJson } from "../store/scenes-persistence";
import { notifySaveField } from "../store/save-sync";
import type { SceneInteractionSaveMap } from "../store/save-types";

/**
 * 程序 UI 模块 id（与 `@extension({ id: "scene-interaction" })` 一致）。
 * App / PlayerShell 关闭会话时复用此常量调用 `ctx.ui.hide`。
 */
/** 游戏运行时程序 UI id（与 `@extension({ id })` 一致） */
export const SCENE_INTERACTION_UI_ID = SCENE_INTERACTION_MODULE_ID;

/** 编辑器程序 UI id */
export const EDITOR_UI_ID = EDITOR_MODULE_ID;

/**
 * 将 method run 回调内的 this.save 收窄为本扩展存档形状。
 *
 * @param save - ExtensionBase.save（EmptySaveAPI）
 * @returns 强类型 SaveAPI<SceneInteractionSaveMap>
 */
function narrowSave(save: unknown): SaveAPI<SceneInteractionSaveMap> {
  return save as SaveAPI<SceneInteractionSaveMap>;
}

/**
 * 可选地将布尔结果写入剧本变量。
 *
 * @param ctx - 扩展运行时上下文
 * @param resultVariable - 变量名；空或未传则跳过
 * @param ok - 操作是否成功
 */
function writeResult(
  ctx: ExtensionContext,
  resultVariable: string | undefined,
  ok: boolean,
): void {
  const name = resultVariable?.trim();

  if (name === undefined || name.length === 0) {
    return;
  }

  ctx.variables.set(name, ok);
}

/**
 * 将检查器传入的字符串参数规范为可查找键。
 *
 * @param raw - schema 解出的原始值
 * @returns trim 后的非空字符串；无效则 null
 */
function normalizeKey(raw: unknown): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  const key = String(raw).trim();

  if (key.length === 0 || key === "undefined" || key === "null") {
    return null;
  }

  return key;
}

/**
 * 从项目设置加载作者端场景库。
 *
 * @param ctx - 扩展上下文（读取 settings.scenesLibraryJson）
 * @returns 解析后的 ScenesLibraryFile（可能为空库）
 */
function loadScenesLibrary(ctx: ExtensionContext): ScenesLibraryFile {
  try {
    const raw = readScenesLibraryJson((key) => readAuthorSetting(ctx, key));

    return parseScenesLibraryJson(raw);
  } catch (err) {
    logError("scene-methods", "读取 settings.scenesLibraryJson 失败", err);

    return parseScenesLibraryJson('{"version":1,"scenes":[]}');
  }
}

/**
 * 按 id 或名称打开场景：写入 currentSceneId，退出编辑模式，并显示程序 UI。
 *
 * @param params.sceneIdOrName - 场景 id 或名称（必填）
 * @param params.resultVariable - 可选；写入是否切换成功
 *
 * @remarks
 * 「调用扩展方法」不会自动显示 `render()`。成功后必须 `ctx.ui.show`。
 *
 * **不会阻塞剧本**：`ctx.ui.show` 返回后方法即结束。需要玩家会话阻塞时请用
 * {@link openSceneInteraction}（`playerSession: "modal"` + `beginPlayerSessionWait`）。
 */
export const openScene = method({
  id: "open-scene",
  title: "打开场景",
  schema: {
    sceneIdOrName: { type: "string", label: "场景 ID/名称", required: true },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    const save = narrowSave(this.save);
    const lib = loadScenesLibrary(ctx);
    const key = normalizeKey(params.sceneIdOrName);

    if (key === null) {
      logError("scene-methods", "openScene: 场景参数无效", params.sceneIdOrName);
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    const scene = findScene(lib.scenes, key);

    if (scene === undefined) {
      logError("scene-methods", `openScene: 未找到场景: ${key}`);
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    try {
      save.set("currentSceneId", scene.id);
      notifySaveField("currentSceneId");

      save.set("isEditMode", false);
      notifySaveField("isEditMode");
    } catch (err) {
      logError("scene-methods", "openScene: 写入存档失败", err);
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    try {
      await ctx.ui.show(
        SCENE_INTERACTION_UI_ID,
        { playerPresentation: true },
        {
          size: "(100%, 100%)",
          position: "(0, 0)",
          interactable: true,
        },
      );
    } catch (err) {
      logError("scene-methods", "openScene: ctx.ui.show 失败", err);
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    writeResult(ctx, params.resultVariable, true);
  },
});

/**
 * 打开场景交互（阻塞）：显示玩家 modal UI，并 await 会话门闩直到关闭。
 *
 * @param params.sceneIdOrName - 可选；场景 id 或名称。省略时用 save.currentSceneId，
 *   再回退 settings.defaultSceneId
 * @param params.resultVariable - 可选；写入是否成功打开并完成等待
 *
 * @returns Promise<void>（SDK method run 无业务返回值）
 *
 * @throws 不向外抛；存档 / UI 失败时写 result false 并 return
 *
 * @example
 * ```ts
 * // 剧本：打开默认/当前场景并阻塞，直到玩家点退出或 closeSceneInteraction
 * await openSceneInteraction.run(ctx, { resultVariable: "ok" });
 * ```
 *
 * @remarks
 * 与 {@link openScene} 不同：注入 `playerSession: "modal"`，并 `await beginPlayerSessionWait()`，
 * 直到 `endPlayerSessionWait`（退出按钮 / closeSceneInteraction）才继续剧本。
 */
export const openSceneInteraction = method({
  id: "open-scene-interaction",
  title: "打开场景交互（阻塞）",
  schema: {
    sceneIdOrName: {
      type: "string",
      label: "场景 ID/名称",
      required: false,
    },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    const save = narrowSave(this.save);
    const lib = loadScenesLibrary(ctx);
    const key = normalizeKey(params.sceneIdOrName);

    if (key !== null) {
      const scene = findScene(lib.scenes, key);

      if (scene === undefined) {
        logError(
          "scene-methods",
          `openSceneInteraction: 未找到场景: ${key}`,
        );
        writeResult(ctx, params.resultVariable, false);

        return;
      }

      try {
        save.set("currentSceneId", scene.id);
        notifySaveField("currentSceneId");
      } catch (err) {
        logError(
          "scene-methods",
          "openSceneInteraction: 写入 currentSceneId 失败",
          err,
        );
        writeResult(ctx, params.resultVariable, false);

        return;
      }
    } else {
      let sceneId = String(save.get("currentSceneId") ?? "").trim();

      if (sceneId.length === 0) {
        sceneId = String(
          readAuthorSetting(ctx, "defaultSceneId") ?? "",
        ).trim();
      }

      if (sceneId.length === 0) {
        logError(
          "scene-methods",
          "openSceneInteraction: 无当前场景且无默认场景",
        );
        writeResult(ctx, params.resultVariable, false);

        return;
      }

      try {
        save.set("currentSceneId", sceneId);
        notifySaveField("currentSceneId");
      } catch (err) {
        logError(
          "scene-methods",
          "openSceneInteraction: 写入 currentSceneId 失败",
          err,
        );
        writeResult(ctx, params.resultVariable, false);

        return;
      }
    }

    try {
      save.set("isEditMode", false);
      notifySaveField("isEditMode");
    } catch (err) {
      logError(
        "scene-methods",
        "openSceneInteraction: 写入 isEditMode 失败",
        err,
      );
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    try {
      await ctx.ui.show(
        SCENE_INTERACTION_UI_ID,
        { playerPresentation: true, playerSession: "modal" },
        {
          size: "(100%, 100%)",
          position: "(0, 0)",
          interactable: true,
        },
      );
    } catch (err) {
      logError("scene-methods", "openSceneInteraction: ctx.ui.show 失败", err);
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    await beginPlayerSessionWait();
    writeResult(ctx, params.resultVariable, true);
  },
});

/**
 * 关闭场景交互：隐藏程序 UI 并解除玩家会话门闩。
 *
 * @param params.resultVariable - 可选；写入是否成功（恒为 true；hide 失败仍 endWait）
 *
 * @returns Promise<void>
 *
 * @example
 * ```ts
 * await closeSceneInteraction.run(ctx, {});
 * ```
 */
export const closeSceneInteraction = method({
  id: "close-scene-interaction",
  title: "关闭场景交互",
  schema: {
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    try {
      await ctx.ui.hide(SCENE_INTERACTION_UI_ID);
    } catch (err) {
      logError("scene-methods", "closeSceneInteraction: ctx.ui.hide 失败", err);
    }

    endPlayerSessionWait();
    writeResult(ctx, params.resultVariable, true);
  },
});

/**
 * 打开 / 关闭编辑器程序 UI（`@extension id: editor`）。
 *
 * @param params.enabled - true 显示编辑器；false 隐藏
 * @param params.resultVariable - 可选；写入是否成功
 *
 * @remarks
 * v0.2 起编辑器为独立程序，不再依赖 save.isEditMode 在同 UI 内分流。
 * 仍会同步写入 isEditMode 以兼容旧剧本。
 */
export const setEditMode = method({
  id: "set-edit-mode",
  title: "设置编辑模式",
  schema: {
    enabled: { type: "boolean", label: "启用编辑模式", default: false },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    const save = narrowSave(this.save);

    try {
      save.set("isEditMode", params.enabled);
      notifySaveField("isEditMode");
    } catch (err) {
      logError("scene-methods", "setEditMode: 写入 isEditMode 失败", err);
    }

    try {
      if (params.enabled) {
        await ctx.ui.show(
          EDITOR_UI_ID,
          {},
          {
            size: "(100%, 100%)",
            position: "(0, 0)",
            interactable: true,
          },
        );
      } else {
        await ctx.ui.hide(EDITOR_UI_ID);
      }
    } catch (err) {
      logError("scene-methods", "setEditMode: 显示/隐藏编辑器失败", err);
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    writeResult(ctx, params.resultVariable, true);
  },
});

/**
 * 读取当前场景 id 并写入指定剧本变量。
 *
 * @param params.targetVariable - 目标变量名（必填）；无当前场景时写入空字符串
 */
export const getCurrentSceneId = method({
  id: "get-current-scene-id",
  title: "获取当前场景 ID",
  schema: {
    targetVariable: { type: "string", label: "写入变量", required: true },
  },
  run(ctx, params) {
    const save = narrowSave(this.save);
    const sceneId = save.get("currentSceneId") ?? "";

    ctx.variables.set(params.targetVariable, sceneId);
  },
});

/**
 * 设置指定交互点的可见性覆盖，写入 slot 的 progressJson。
 *
 * @param params.hotspotId - 交互点 id（必填）
 * @param params.visible - 是否可见
 * @param params.resultVariable - 可选；写入操作是否成功
 */
export const setHotspotVisible = method({
  id: "set-hotspot-visible",
  title: "设置交互点可见性",
  schema: {
    hotspotId: { type: "string", label: "交互点 ID", required: true },
    visible: { type: "boolean", label: "可见", default: true },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  run(ctx, params) {
    const save = narrowSave(this.save);
    const hotspotId = normalizeKey(params.hotspotId);

    if (hotspotId === null) {
      logError("scene-methods", "setHotspotVisible: hotspotId 无效");
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    const lib = loadScenesLibrary(ctx);
    const exists = lib.scenes.some((scene) =>
      scene.hotspots.some((hs) => hs.id === hotspotId),
    );

    if (!exists) {
      logError(
        "scene-methods",
        `setHotspotVisible: 未找到交互点: ${hotspotId}`,
      );
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    const progress = parseProgressJson(save.get("progressJson"));
    const next = setHotspotVisibility(progress, hotspotId, params.visible);

    save.set("progressJson", stringifyProgress(next));
    notifySaveField("progressJson");
    writeResult(ctx, params.resultVariable, true);
  },
});
