/**
 * preview-save.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.4
 *
 * 预览用 SaveAPI：
 * - createPreviewSave：纯内存（单测）
 * - createSettingsPreviewSave：场景 id / 返回栈可落 settings；
 *   **inventoryJson / progressJson 只留内存，绝不写 settings**
 *
 * 与玩家 slot 存档（saveSchema）完全隔离。
 */

import type { ExtensionContext, SaveAPI } from "@avg-studio/sdk";
import {
  PREVIEW_CURRENT_SCENE_ID_KEY,
  PREVIEW_SCENE_RETURN_STACK_JSON_KEY,
  readPreviewSaveSetting,
  writePreviewSaveSetting,
} from "./preview-save-settings";
import { notifySaveField } from "./save-sync";
import type { SceneInteractionSaveMap } from "./save-types";

const DEFAULT_INVENTORY = '{"entries":[]}';
const DEFAULT_PROGRESS = '{"consumed":{}}';
const DEFAULT_SCENE_RETURN_STACK = "[]";

/**
 * `createSettingsPreviewSave` 可选行为。
 */
export type SettingsPreviewSaveOptions = {
  /**
   * 进入编辑器「运行预览」时为 `true`：强制清空返回栈并写回 settings。
   *
   * @default false
   */
  resetReturnStack?: boolean;

  /**
   * 为 `true` 且 `overrides.currentSceneId` 为非空字符串时：
   * 强制使用该 id（覆盖沙箱里上次预览残留的 `previewCurrentSceneId`），并写回 settings。
   *
   * 编辑器「运行预览」应与 `resetReturnStack` 一并开启，以便预览左侧当前选中场景。
   *
   * @default false
   */
  preferOverrideSceneId?: boolean;
};

/**
 * @param raw - settings 原始值
 * @param fallback - 回退字符串
 * @returns 非空字符串
 */
function asString(raw: unknown, fallback: string): string {
  if (typeof raw === "string") {
    return raw;
  }

  if (raw === undefined || raw === null) {
    return fallback;
  }

  return String(raw);
}

/**
 * 创建纯内存预览存档（不落盘；单测 / 临时会话）。
 *
 * @param initial - 可选初始字段
 * @returns SaveAPI&lt;SceneInteractionSaveMap&gt;
 *
 * @example
 * ```ts
 * const save = createPreviewSave({ currentSceneId: "room-1" });
 * ```
 */
export function createPreviewSave(
  initial: Partial<SceneInteractionSaveMap> = {},
): SaveAPI<SceneInteractionSaveMap> {
  const store: SceneInteractionSaveMap = {
    inventoryJson: DEFAULT_INVENTORY,
    progressJson: DEFAULT_PROGRESS,
    isEditMode: false,
    currentSceneId: "",
    sceneReturnStackJson: DEFAULT_SCENE_RETURN_STACK,
    ...initial,
  };

  return {
    get<K extends keyof SceneInteractionSaveMap>(
      key: K,
    ): SceneInteractionSaveMap[K] {
      return store[key];
    },

    set<K extends keyof SceneInteractionSaveMap>(
      key: K,
      value: SceneInteractionSaveMap[K],
    ): void {
      store[key] = value;
    },

    useValue<K extends keyof SceneInteractionSaveMap>(
      key: K,
    ): [
      SceneInteractionSaveMap[K],
      (value: SceneInteractionSaveMap[K]) => void,
    ] {
      return [
        store[key],
        (value) => {
          store[key] = value;
        },
      ];
    },
  };
}

/**
 * 将 save 字段同步写入扩展 settings 沙箱。
 *
 * @param ctx - 扩展上下文
 * @param key - SaveMap 字段
 * @param value - 值
 */
function persistPreviewField(
  ctx: ExtensionContext,
  key: keyof SceneInteractionSaveMap,
  value: SceneInteractionSaveMap[keyof SceneInteractionSaveMap],
): void {
  /**
   * 库存 / once 故意不落 settings：仅本次预览内存；玩家走 slot。
   */
  if (key === "inventoryJson" || key === "progressJson") {
    return;
  }

  if (key === "currentSceneId") {
    writePreviewSaveSetting(ctx, PREVIEW_CURRENT_SCENE_ID_KEY, value);

    return;
  }

  if (key === "sceneReturnStackJson") {
    writePreviewSaveSetting(ctx, PREVIEW_SCENE_RETURN_STACK_JSON_KEY, value);

    return;
  }

  // isEditMode 预览不落 settings
}

/**
 * 创建落在扩展 settings 的预览存档（便于反复测试；不写玩家 slot）。
 *
 * @param ctx - 扩展上下文（读写 scene-interaction settings）
 * @param overrides - 可选覆盖；默认仅当沙箱对应字段为空时填入 currentSceneId 等
 * @param options - 行为选项；编辑器运行预览应传
 *   `{ resetReturnStack: true, preferOverrideSceneId: true }`
 * @returns SaveAPI；set 时写回 settings（库存/once 除外）并 notifySaveField
 *
 * @example
 * ```ts
 * // 预览左侧选中场景；库存与 once 仅本次预览内存有效
 * const save = createSettingsPreviewSave(
 *   ctx,
 *   { currentSceneId: selectedSceneId },
 *   { resetReturnStack: true, preferOverrideSceneId: true },
 * );
 * useEffect(() => bindInventoryPersistence(save), [save]);
 * ```
 *
 * @remarks
 * 玩家游戏请继续使用宿主注入的 slot SaveAPI，勿调用本函数。
 * 库存 / once 只进玩家 slot，不进 settings。
 */
export function createSettingsPreviewSave(
  ctx: ExtensionContext,
  overrides: Partial<SceneInteractionSaveMap> = {},
  options: SettingsPreviewSaveOptions = {},
): SaveAPI<SceneInteractionSaveMap> {
  const loadedSceneId = asString(
    readPreviewSaveSetting(ctx, PREVIEW_CURRENT_SCENE_ID_KEY),
    "",
  );
  const loadedReturnStack = asString(
    readPreviewSaveSetting(ctx, PREVIEW_SCENE_RETURN_STACK_JSON_KEY),
    DEFAULT_SCENE_RETURN_STACK,
  );

  const overrideSceneId =
    typeof overrides.currentSceneId === "string"
      ? overrides.currentSceneId.trim()
      : "";

  /**
   * 返回栈：
   * - `resetReturnStack`：先清空沙箱；若同时提供 `overrides.sceneReturnStackJson`
   *   则写入该种子栈（编辑器预览可预置「主场景」以便显示返回按钮）
   * - 否则用 override / 已加载沙箱值
   */
  let sceneReturnStackJson: string;

  if (options.resetReturnStack === true) {
    const seeded =
      typeof overrides.sceneReturnStackJson === "string"
        ? overrides.sceneReturnStackJson.trim()
        : "";

    sceneReturnStackJson =
      seeded.length > 0 ? seeded : DEFAULT_SCENE_RETURN_STACK;

    writePreviewSaveSetting(
      ctx,
      PREVIEW_SCENE_RETURN_STACK_JSON_KEY,
      sceneReturnStackJson,
    );
  } else if (typeof overrides.sceneReturnStackJson === "string") {
    sceneReturnStackJson = overrides.sceneReturnStackJson;
  } else {
    sceneReturnStackJson = loadedReturnStack;
  }

  /**
   * 解析预览用 currentSceneId：
   * - preferOverrideSceneId + 非空 override → 强制用 override（写回 settings）
   * - 否则优先沙箱已有值，再回退 override
   */
  let currentSceneId: string;

  if (
    options.preferOverrideSceneId === true &&
    overrideSceneId.length > 0
  ) {
    currentSceneId = overrideSceneId;
    writePreviewSaveSetting(
      ctx,
      PREVIEW_CURRENT_SCENE_ID_KEY,
      overrideSceneId,
    );
  } else if (loadedSceneId.length > 0) {
    currentSceneId = loadedSceneId;
  } else if (overrideSceneId.length > 0) {
    currentSceneId = overrideSceneId;
  } else {
    currentSceneId = "";
  }

  /**
   * 库存 / once：只进本次预览的内存 store，不读不写 settings。
   */
  const inventoryJson =
    typeof overrides.inventoryJson === "string" &&
    overrides.inventoryJson.trim().length > 0
      ? overrides.inventoryJson
      : DEFAULT_INVENTORY;
  const progressJson =
    typeof overrides.progressJson === "string" &&
    overrides.progressJson.trim().length > 0
      ? overrides.progressJson
      : DEFAULT_PROGRESS;

  const mainSceneId =
    typeof overrides.mainSceneId === "string"
      ? overrides.mainSceneId.trim()
      : currentSceneId;

  const store: SceneInteractionSaveMap = {
    inventoryJson,
    progressJson,
    isEditMode:
      typeof overrides.isEditMode === "boolean"
        ? overrides.isEditMode
        : false,
    currentSceneId,
    mainSceneId,
    sceneReturnStackJson,
  };

  const api: SaveAPI<SceneInteractionSaveMap> = {
    get<K extends keyof SceneInteractionSaveMap>(
      key: K,
    ): SceneInteractionSaveMap[K] {
      return store[key];
    },

    set<K extends keyof SceneInteractionSaveMap>(
      key: K,
      value: SceneInteractionSaveMap[K],
    ): void {
      store[key] = value;
      persistPreviewField(ctx, key, value);
      notifySaveField(String(key));
    },

    useValue<K extends keyof SceneInteractionSaveMap>(
      key: K,
    ): [
      SceneInteractionSaveMap[K],
      (value: SceneInteractionSaveMap[K]) => void,
    ] {
      return [
        store[key],
        (value) => {
          api.set(key, value);
        },
      ];
    },
  };

  return api;
}
