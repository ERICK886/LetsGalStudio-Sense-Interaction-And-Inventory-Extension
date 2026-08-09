/**
 * scene-methods.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.3
 *
 * 场景交互扩展剧本 methods：打开场景、阻塞玩家会话、编辑模式、当前场景 id、交互点可见性。
 * SDK method().run 无返回值；成功/失败可通过可选 resultVariable 写入剧本变量。
 *
 * 作者端场景库一律从 settings.scenesLibraryJson 读取；进度 / 当前场景走 save。
 *
 * runImmediately：不 show/hide，只落存档 / 会话副作用。
 * 打开类 UI（openScene / openSceneInteraction / setEditMode）：不声明 skip，
 * 快进时引擎 fallback 到 run，并 exitSkipMode，避免玩家跳过交互界面。
 * closeSceneInteraction.skip：只解门闩不 hide。
 */

import { method, type ExtensionContext, type SaveAPI } from "@avg-studio/sdk";
import { setHotspotVisibility } from "../domain/progress";
import {
  openSceneWithReturn,
  parseSceneReturnStackJson,
  stringifySceneReturnStack,
} from "../domain/scene-return-stack";
import {
  parseProgressJson,
  parseScenesLibraryJson,
  stringifyProgress,
} from "../domain/serialize";
import type { ScenesLibraryFile } from "../domain/types";
import {
  abandonPlayerSessionWait,
  beginPlayerSessionWait,
  endPlayerSessionWait,
  isPlayerSessionPending,
} from "../runtime/player-session";
import {
  forceClearPlayerOverlaySession,
  isPlayerOverlaySessionActive,
  rememberSceneUiPath,
  setPlayerOverlaySession,
  setSceneInteractionRestoreProps,
} from "../runtime/suspend-overlay-for-fragment";
import {
  EDITOR_MODULE_ID,
  EXTENSION_PACKAGE_ID,
  SCENE_INTERACTION_MODULE_ID,
} from "../shared/module-ids";
import { logDebug, logError, logWarn } from "../shared/logger";
import { readAuthorSetting } from "../store/author-settings";
import { SCENE_PASSTHROUGH_SHOW_OPTIONS } from "../store/passthrough-show-options";
import { readScenesLibraryJson } from "../store/scenes-persistence";
import { notifySaveField } from "../store/save-sync";
import type { SceneInteractionSaveMap } from "../store/save-types";
import { registerSlotSave, writeSlotField } from "../store/slot-save-bridge";

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
 * 退出玩家快进（打开交互 UI 前调用）。
 * 引擎约定：不提供 method.skip 时 fallback 到 run；此处再关 skip 状态。
 *
 * @param ctx - 扩展上下文
 */
function exitPlayerSkipMode(ctx: ExtensionContext): void {
  try {
    ctx.dialogue.setSkipMode(false);
  } catch {
    // 非对话 channel 时宿主可能忽略；忽略异常
  }
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
 * 场景库目录摘要（未找到场景时对照检查器参数）。
 *
 * @param lib - 当前场景库
 * @returns 简短列表；空库时提示检查 editor 设置
 */
function formatSceneCatalog(lib: ScenesLibraryFile): string {
  if (lib.scenes.length === 0) {
    return "(库为空：请在「场景编辑器」保存场景，并确认 settings 挂在 editor 模块)";
  }

  return lib.scenes.map((s) => `${s.name} [${s.id}]`).join(", ");
}

type MethodThis = { save: unknown };

type OpenSceneParams = {
  sceneIdOrName: string;
  returnTarget: string;
  pushReturn: boolean;
  resultVariable: string;
};

/**
 * 场景动作 openScene 的存档副作用。
 * 写 `sceneReturnStackJson` / `currentSceneId` / `isEditMode`。
 *
 * @param ctx - 扩展上下文
 * @param save - 存档 API
 * @param params - 打开参数
 * @returns 是否写入成功
 */
function applyOpenSceneSave(
  ctx: ExtensionContext,
  save: SaveAPI<SceneInteractionSaveMap>,
  params: OpenSceneParams,
): boolean {
  const lib = loadScenesLibrary(ctx);
  const key = normalizeKey(params.sceneIdOrName);

  if (key === null) {
    logError(
      "scene-methods",
      "openScene: 场景参数无效（请用「值」填写场景 id/名称，勿用未绑定变量）",
    );

    return false;
  }

  const currentSceneId = String(save.get("currentSceneId") ?? "");
  const stack = parseSceneReturnStackJson(save.get("sceneReturnStackJson"));
  const returnTarget = normalizeKey(params.returnTarget) ?? undefined;
  const pushReturn = params.pushReturn !== false;

  const result = openSceneWithReturn({
    scenes: lib.scenes,
    currentSceneId,
    stack,
    targetKey: key,
    returnTarget,
    pushReturn,
  });

  if (!result.ok || result.nextSceneId === null) {
    logError(
      "scene-methods",
      `openScene: 未找到场景「${key}」。当前库: ${formatSceneCatalog(lib)}`,
    );

    return false;
  }

  try {
    save.set(
      "sceneReturnStackJson",
      stringifySceneReturnStack(result.nextStack),
    );
    notifySaveField("sceneReturnStackJson");

    save.set("currentSceneId", result.nextSceneId);
    notifySaveField("currentSceneId");

    save.set("isEditMode", false);
    notifySaveField("isEditMode");
  } catch (err) {
    logError("scene-methods", "openScene: 写入存档失败", err);

    return false;
  }

  return true;
}

type OpenSceneInteractionParams = {
  sceneIdOrName: string;
  returnTarget: string;
  pushReturn: boolean;
  resultVariable: string;
};

/**
 * 阻塞打开的存档副作用（与场景内 openScene 动作同一套字段）。
 *
 * @param ctx - 扩展上下文
 * @param save - 存档 API
 * @param params - 打开参数
 * @returns 是否写入成功
 */
function applyOpenSceneInteractionSave(
  ctx: ExtensionContext,
  save: SaveAPI<SceneInteractionSaveMap>,
  params: OpenSceneInteractionParams,
): boolean {
  const lib = loadScenesLibrary(ctx);
  const key = normalizeKey(params.sceneIdOrName);

  if (key !== null) {
    const currentSceneId = String(save.get("currentSceneId") ?? "");
    const stack = parseSceneReturnStackJson(save.get("sceneReturnStackJson"));
    const returnTarget = normalizeKey(params.returnTarget) ?? undefined;
    const pushReturn = params.pushReturn !== false;

    const result = openSceneWithReturn({
      scenes: lib.scenes,
      currentSceneId,
      stack,
      targetKey: key,
      returnTarget,
      pushReturn,
    });

    if (!result.ok || result.nextSceneId === null) {
      logError(
        "scene-methods",
        `openSceneInteraction: 未找到场景: ${key}`,
      );

      return false;
    }

    try {
      save.set(
        "sceneReturnStackJson",
        stringifySceneReturnStack(result.nextStack),
      );
      notifySaveField("sceneReturnStackJson");

      save.set("currentSceneId", result.nextSceneId);
      notifySaveField("currentSceneId");
    } catch (err) {
      logError(
        "scene-methods",
        "openSceneInteraction: 写入 currentSceneId / 返回栈失败",
        err,
      );

      return false;
    }
  } else {
    let sceneId = String(save.get("currentSceneId") ?? "").trim();

    if (sceneId.length === 0) {
      sceneId = String(readAuthorSetting(ctx, "defaultSceneId") ?? "").trim();
    }

    if (sceneId.length === 0) {
      logError(
        "scene-methods",
        "openSceneInteraction: 无当前场景且无默认场景",
      );

      return false;
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

      return false;
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

    return false;
  }

  return true;
}

/**
 * 按 id 或名称打开场景：经 `openSceneWithReturn` 计算下一场景与返回栈，
 * 写入 `sceneReturnStackJson` 与 `currentSceneId`，退出编辑模式，并显示程序 UI。
 *
 * @param params.sceneIdOrName - 场景 id 或名称（必填）
 * @param params.returnTarget - 可选；覆盖压栈的返回目标（场景 id/name），
 *   缺省时压入打开前的 `currentSceneId`
 * @param params.pushReturn - 缺省 true；false 时只切场景、不改返回栈
 * @param params.resultVariable - 可选；写入是否切换成功
 *
 * @remarks
 * 「调用扩展方法」不会自动显示 `render()`。成功后必须 `ctx.ui.show`。
 *
 * **不会阻塞剧本**：`ctx.ui.show` 返回后方法即结束。需要玩家会话阻塞时请用
 * {@link openSceneInteraction}（`playerSession: "modal"` + `beginPlayerSessionWait`）。
 *
 * runImmediately：只写 save。不声明 skip → 快进走 run（阻止跳过界面）。
 */
export const openScene = method({
  id: "open-scene",
  title: "打开场景",
  description:
    "写 currentSceneId / 返回栈并 show UI；快进不可跳过（走 run）",
  schema: {
    sceneIdOrName: { type: "string", label: "场景 ID/名称", required: true },
    returnTarget: {
      type: "string",
      label: "返回目标（可选）",
      required: false,
    },
    pushReturn: { type: "boolean", label: "压入返回栈", required: false },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    exitPlayerSkipMode(ctx);
    const save = narrowSave(this.save);

    if (!applyOpenSceneSave(ctx, save, params)) {
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    const openProps = { playerPresentation: true as const };
    setSceneInteractionRestoreProps(openProps);
    setPlayerOverlaySession(true);
    rememberSceneUiPath(
      `${EXTENSION_PACKAGE_ID}/${SCENE_INTERACTION_MODULE_ID}`,
    );

    try {
      await ctx.ui.show(
        SCENE_INTERACTION_UI_ID,
        openProps,
        { ...SCENE_PASSTHROUGH_SHOW_OPTIONS },
      );
    } catch (err) {
      logError("scene-methods", "openScene: ctx.ui.show 失败", err);
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    writeResult(ctx, params.resultVariable, true);
  },
  runImmediately(ctx, params) {
    const save = narrowSave(this.save);
    const ok = applyOpenSceneSave(ctx, save, params);
    writeResult(ctx, params.resultVariable, ok);
  },
});

/**
 * 打开场景交互（阻塞）：显示玩家 modal UI，并 await 会话门闩直到关闭。
 *
 * @param params.sceneIdOrName - 可选；场景 id 或名称。省略时用 save.currentSceneId，
 *   再回退 settings.defaultSceneId（此分支不切换场景、不入栈）
 * @param params.returnTarget - 可选；覆盖压栈的返回目标（仅切换场景时生效）
 * @param params.pushReturn - 缺省 true；false 时只切场景、不改返回栈
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
  description:
    "show modal UI 并阻塞；不声明 skip，快进走 run（不可跳过交互）",
  schema: {
    sceneIdOrName: {
      type: "string",
      label: "场景 ID/名称",
      required: false,
    },
    returnTarget: {
      type: "string",
      label: "返回目标（可选）",
      required: false,
    },
    pushReturn: { type: "boolean", label: "压入返回栈", required: false },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    exitPlayerSkipMode(ctx);
    const save = narrowSave(this.save);
    /** 权威 slot proxy：后续 giveItem 等写入与调试器同一 VariableSystem */
    registerSlotSave(save, { authoritative: true });

    if (!applyOpenSceneInteractionSave(ctx, save, params)) {
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    const openProps = {
      playerPresentation: true as const,
      playerSession: "modal" as const,
    };

    /**
     * 预览重启后可能留下无叠层的僵尸门闩：丢弃且不 resolve。
     * 若叠层仍在则保留门闩，供下方 begin 复用（切勿 resolve，以免误推进剧本）。
     */
    if (isPlayerSessionPending() && !isPlayerOverlaySessionActive()) {
      abandonPlayerSessionWait();
    } else if (isPlayerSessionPending()) {
      logWarn(
        "continue-story",
        "openSceneInteraction：已有阻塞门闩且叠层仍在，将复用（请确认未重复打开）",
        { t: Date.now() },
      );
    }

    setSceneInteractionRestoreProps(openProps);
    setPlayerOverlaySession(true);
    rememberSceneUiPath(
      `${EXTENSION_PACKAGE_ID}/${SCENE_INTERACTION_MODULE_ID}`,
    );

    try {
      await ctx.ui.show(
        SCENE_INTERACTION_UI_ID,
        openProps,
        { ...SCENE_PASSTHROUGH_SHOW_OPTIONS },
      );
      logDebug("continue-story", "openSceneInteraction: ui.show 完成，即将 await 门闩", {
        t: Date.now(),
        restoreProps: openProps,
      });
    } catch (err) {
      logError("scene-methods", "openSceneInteraction: ctx.ui.show 失败", err);
      writeResult(ctx, params.resultVariable, false);

      return;
    }

    await beginPlayerSessionWait();
    logDebug("continue-story", "openSceneInteraction: 门闩已解除，剧本可继续", {
      t: Date.now(),
    });
    writeResult(ctx, params.resultVariable, true);
  },
  /**
   * 立即写 save（场景切换副作用），不阻塞、不 show。
   * 需要完整交互会话时仍走 run；快进不可跳过靠「不声明 skip」。
   */
  runImmediately(ctx, params) {
    const save = narrowSave(this.save);
    const ok = applyOpenSceneInteractionSave(ctx, save, params);
    writeResult(ctx, params.resultVariable, ok);
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
/**
 * 关闭会话：解除门闩并清叠层标记（对齐场景动作 continueStory 的收尾）。
 * 不改 inventory / progress；可选 hide UI。
 *
 * @param ctx - 扩展上下文
 * @param hideUi - 是否调用 ui.hide（runImmediately/skip 传 false）
 * @param resultVariable - 结果变量
 */
async function applyCloseSceneInteraction(
  ctx: ExtensionContext,
  hideUi: boolean,
  resultVariable: string | undefined,
): Promise<void> {
  if (hideUi) {
    try {
      await ctx.ui.hide(SCENE_INTERACTION_UI_ID);
    } catch (err) {
      logError("scene-methods", "closeSceneInteraction: ctx.ui.hide 失败", err);
    }
  }

  endPlayerSessionWait();
  forceClearPlayerOverlaySession();
  writeResult(ctx, resultVariable, true);
}

/**
 * 快进 / 立即执行：只解门闩，不 hide UI。
 *
 * @param ctx - 扩展上下文
 * @param resultVariable - 结果变量
 */
function applyCloseSceneInteractionSaveOnly(
  ctx: ExtensionContext,
  resultVariable: string | undefined,
): void {
  endPlayerSessionWait();
  forceClearPlayerOverlaySession();
  writeResult(ctx, resultVariable, true);
}

export const closeSceneInteraction = method({
  id: "close-scene-interaction",
  title: "关闭场景交互",
  description: "hide UI + 解除阻塞门闩；快进只解门闩不 hide",
  schema: {
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    await applyCloseSceneInteraction(ctx, true, params.resultVariable);
  },
  runImmediately(ctx, params) {
    applyCloseSceneInteractionSaveOnly(ctx, params.resultVariable);
  },
  skip(ctx, params) {
    applyCloseSceneInteractionSaveOnly(ctx, params.resultVariable);
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
/**
 * 写 isEditMode（存档副作用）。
 *
 * @param save - 存档
 * @param enabled - 是否编辑模式
 * @returns 是否写入成功
 */
function applyEditModeSave(
  save: SaveAPI<SceneInteractionSaveMap>,
  enabled: boolean,
): boolean {
  try {
    save.set("isEditMode", enabled);
    notifySaveField("isEditMode");

    return true;
  } catch (err) {
    logError("scene-methods", "setEditMode: 写入 isEditMode 失败", err);

    return false;
  }
}

export const setEditMode = method({
  id: "set-edit-mode",
  title: "设置编辑模式",
  description:
    "写 isEditMode 并 show/hide 编辑器；不声明 skip，快进走 run",
  schema: {
    enabled: { type: "boolean", label: "启用编辑模式", default: false },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  async run(ctx, params) {
    if (params.enabled) {
      exitPlayerSkipMode(ctx);
    }

    const save = narrowSave(this.save);
    applyEditModeSave(save, params.enabled);

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
  runImmediately(ctx, params) {
    const save = narrowSave(this.save);
    const ok = applyEditModeSave(save, params.enabled);
    writeResult(ctx, params.resultVariable, ok);
  },
});

type GetCurrentSceneIdParams = {
  targetVariable: string;
};

/**
 * 只读 currentSceneId → 变量。
 *
 * @param this - 方法 this
 * @param ctx - 上下文
 * @param params - 参数
 */
function applyGetCurrentSceneId(
  this: MethodThis,
  ctx: ExtensionContext,
  params: GetCurrentSceneIdParams,
): void {
  const save = narrowSave(this.save);
  const sceneId = save.get("currentSceneId") ?? "";

  ctx.variables.set(params.targetVariable, sceneId);
}

/**
 * 读取当前场景 id 并写入指定剧本变量。
 *
 * @param params.targetVariable - 目标变量名（必填）；无当前场景时写入空字符串
 */
export const getCurrentSceneId = method({
  id: "get-current-scene-id",
  title: "获取当前场景 ID",
  description: "只读 currentSceneId，不改存档",
  schema: {
    targetVariable: { type: "string", label: "写入变量", required: true },
  },
  run: applyGetCurrentSceneId,
  runImmediately: applyGetCurrentSceneId,
  skip: applyGetCurrentSceneId,
});

type SetHotspotVisibleParams = {
  hotspotId: string;
  visible: boolean;
  resultVariable: string;
};

/**
 * 写 progressJson（交互点可见性覆盖）。
 *
 * @param this - 方法 this
 * @param ctx - 上下文
 * @param params - 参数
 */
function applySetHotspotVisible(
  this: MethodThis,
  ctx: ExtensionContext,
  params: SetHotspotVisibleParams,
): void {
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

  registerSlotSave(save, { authoritative: true });
  writeSlotField("progressJson", stringifyProgress(next), save);
  writeResult(ctx, params.resultVariable, true);
}

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
  description: "写 save.progressJson",
  schema: {
    hotspotId: { type: "string", label: "交互点 ID", required: true },
    visible: { type: "boolean", label: "可见", default: true },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  run: applySetHotspotVisible,
  runImmediately: applySetHotspotVisible,
  skip: applySetHotspotVisible,
});
