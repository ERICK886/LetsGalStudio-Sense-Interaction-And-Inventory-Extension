/**
 * slot-save-bridge.ts
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.2.0
 *
 * 登记 scene-interaction 的权威 SaveAPI（method.run 里的 this.save）。
 * 调试器读的是 VariableSystem；背包 HUD 的预览 SaveAPI 只是内存壳，
 * 不得覆盖权威 proxy，否则 inventoryJson 写后读回「成功」但调试器仍为空。
 */

import type { SaveAPI } from "@avg-studio/sdk";
import { logDebug, logWarn } from "../shared/logger";
import type { SceneInteractionSaveMap } from "./save-types";
import { notifySaveField } from "./save-sync";

/** method / App 登记的权威 slot save */
let slotSave: SaveAPI<SceneInteractionSaveMap> | null = null;

/** 是否来自 scene-interaction method / 玩家 slot（非预览内存壳） */
let slotSaveAuthoritative = false;

export type RegisterSlotSaveOptions = {
  /**
   * `true`：method.run 的 this.save / 玩家运行时绑定。
   * 权威登记后，非权威（预览）调用将被忽略。
   *
   * @default false
   */
  authoritative?: boolean;
};

/**
 * 登记存档 proxy（openSceneInteraction / App 挂载 / 预览回退时调用）。
 *
 * @param save - scene-interaction 的 SaveAPI
 * @param options - authoritative 防止被背包预览壳覆盖
 */
export function registerSlotSave(
  save: SaveAPI<SceneInteractionSaveMap>,
  options?: RegisterSlotSaveOptions,
): void {
  const authoritative = options?.authoritative === true;

  if (slotSave !== null && slotSaveAuthoritative && !authoritative) {
    logDebug("slot-save", "registerSlotSave：忽略非权威覆盖", {
      hasSave: true,
    });

    return;
  }

  slotSave = save;
  slotSaveAuthoritative = authoritative;
  logDebug("slot-save", "registerSlotSave", {
    hasSave: true,
    authoritative,
  });
}

/**
 * @returns 当前权威 SaveAPI；未登记则为 null
 */
export function getSlotSave(): SaveAPI<SceneInteractionSaveMap> | null {
  return slotSave;
}

/**
 * @returns 当前登记是否为权威 slot（VariableSystem）
 */
export function isSlotSaveAuthoritative(): boolean {
  return slotSave !== null && slotSaveAuthoritative;
}

/**
 * 写入 slot 字段并读回校验；失败打 WARN。
 *
 * @param key - saveSchema 字段
 * @param value - 新值
 * @param fallback - 可选第二路 SaveAPI（如会话绑定的 save）
 * @returns 是否至少权威/首选一路读回一致
 */
export function writeSlotField<K extends keyof SceneInteractionSaveMap>(
  key: K,
  value: SceneInteractionSaveMap[K],
  fallback?: SaveAPI<SceneInteractionSaveMap> | null,
): boolean {
  const targets: SaveAPI<SceneInteractionSaveMap>[] = [];

  if (slotSave !== null) {
    targets.push(slotSave);
  }

  if (
    fallback != null &&
    fallback !== slotSave
  ) {
    targets.push(fallback);
  }

  if (targets.length === 0) {
    logWarn("slot-save", "writeSlotField：无可用 SaveAPI", {
      key: String(key),
    });

    return false;
  }

  for (const api of targets) {
    try {
      api.set(key, value);
    } catch (err) {
      logWarn("slot-save", "writeSlotField：set 抛错", {
        key: String(key),
        err,
      });
    }
  }

  notifySaveField(String(key));

  const reader = slotSave ?? fallback ?? null;

  if (reader === null) {
    return false;
  }

  try {
    const got = reader.get(key);
    const ok =
      Object.is(got, value) ||
      (typeof got === "string" &&
        typeof value === "string" &&
        got === value);

    if (!ok) {
      logWarn(
        "slot-save",
        "writeSlotField：写后读回不一致（调试器可能仍显示旧值）",
        {
          key: String(key),
          wroteLen: typeof value === "string" ? value.length : -1,
          gotLen: typeof got === "string" ? got.length : -1,
          gotPreview:
            typeof got === "string" ? got.slice(0, 80) : String(got),
          authoritative: slotSaveAuthoritative,
        },
      );
    } else {
      logDebug("slot-save", "writeSlotField：ok", {
        key: String(key),
        authoritative: slotSaveAuthoritative,
      });
    }

    return ok;
  } catch (err) {
    logWarn("slot-save", "writeSlotField：get 校验失败", {
      key: String(key),
      err,
    });

    return false;
  }
}
