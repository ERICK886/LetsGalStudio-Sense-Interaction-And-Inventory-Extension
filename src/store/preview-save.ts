/**
 * preview-save.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.1
 *
 * 预览用 SaveAPI：
 * - createPreviewSave：纯内存（单测）
 * - createSettingsPreviewSave：读写 scene-interaction.settings 沙箱（Studio/编辑器预览）
 *
 * 与玩家 slot 存档（saveSchema）完全隔离。
 */

import type { ExtensionContext, SaveAPI } from "@avg-studio/sdk";
import {
  PREVIEW_CURRENT_SCENE_ID_KEY,
  PREVIEW_INVENTORY_JSON_KEY,
  PREVIEW_PROGRESS_JSON_KEY,
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
  if (key === "inventoryJson") {
    writePreviewSaveSetting(ctx, PREVIEW_INVENTORY_JSON_KEY, value);

    return;
  }

  if (key === "progressJson") {
    writePreviewSaveSetting(ctx, PREVIEW_PROGRESS_JSON_KEY, value);

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
 * @param overrides - 可选覆盖；仅当沙箱对应字段为空时填入 currentSceneId 等
 * @param options - 行为选项；编辑器运行预览应传 `{ resetReturnStack: true }`
 * @returns SaveAPI；set 时写回 settings 并 notifySaveField
 *
 * @example
 * ```ts
 * const save = createSettingsPreviewSave(ctx, {
 *   currentSceneId: "room-1",
 * }, { resetReturnStack: true });
 * useEffect(() => bindInventoryPersistence(save), [save]);
 * ```
 *
 * @remarks
 * 玩家游戏请继续使用宿主注入的 slot SaveAPI，勿调用本函数。
 */
export function createSettingsPreviewSave(
  ctx: ExtensionContext,
  overrides: Partial<SceneInteractionSaveMap> = {},
  options: SettingsPreviewSaveOptions = {},
): SaveAPI<SceneInteractionSaveMap> {
  const loadedInventory = asString(
    readPreviewSaveSetting(ctx, PREVIEW_INVENTORY_JSON_KEY),
    DEFAULT_INVENTORY,
  );
  const loadedProgress = asString(
    readPreviewSaveSetting(ctx, PREVIEW_PROGRESS_JSON_KEY),
    DEFAULT_PROGRESS,
  );
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

  let sceneReturnStackJson: string;

  if (options.resetReturnStack === true) {
    sceneReturnStackJson = DEFAULT_SCENE_RETURN_STACK;
    writePreviewSaveSetting(
      ctx,
      PREVIEW_SCENE_RETURN_STACK_JSON_KEY,
      DEFAULT_SCENE_RETURN_STACK,
    );
  } else if (typeof overrides.sceneReturnStackJson === "string") {
    sceneReturnStackJson = overrides.sceneReturnStackJson;
  } else {
    sceneReturnStackJson = loadedReturnStack;
  }

  const store: SceneInteractionSaveMap = {
    inventoryJson:
      typeof overrides.inventoryJson === "string"
        ? overrides.inventoryJson
        : loadedInventory,
    progressJson:
      typeof overrides.progressJson === "string"
        ? overrides.progressJson
        : loadedProgress,
    isEditMode:
      typeof overrides.isEditMode === "boolean"
        ? overrides.isEditMode
        : false,
    currentSceneId:
      loadedSceneId.length > 0
        ? loadedSceneId
        : overrideSceneId.length > 0
          ? overrideSceneId
          : "",
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
