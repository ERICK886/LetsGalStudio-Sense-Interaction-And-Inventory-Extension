/**
 * open-scene-target.ts
 * 作者: 池水三两升
 * 日期: 2026-08-10
 * 版本: 0.2.0
 *
 * 打开场景交互时的强制目标场景（方法 → 壳层）。
 *
 * - `setMethodOpenSceneTarget`：剧本方法开场，递增 nonce，壳层必须覆盖存档残留
 * - `setForcedOpenSceneId`：场景内跳转仅同步 id，不递增 nonce（避免锁死互跳）
 */

import { notifySaveField, subscribeSaveField } from "./save-sync";

/** 与 save-sync 共用总线的伪字段名 */
const TARGET_SYNC_KEY = "__openSceneTargetId";

/** 当前强制打开的场景 id；无则为 null */
let forcedOpenSceneId: string | null = null;

/**
 * 方法开场代数：壳层发现 nonce 变化时必须把 currentSceneId 写成 forced。
 * 场景内 openScene 不递增，故不会盖住玩家跳转。
 */
let openSceneNonce = 0;

/**
 * 设置方法侧开场目标（递增 nonce，强制覆盖存档残留的旧 currentSceneId）。
 *
 * @param sceneId - 场景定义 id；空串 / null 清除
 * @param nonce - 可选；与 ui.show props.openNonce 对齐；缺省用 Date.now()
 */
export function setMethodOpenSceneTarget(
  sceneId: string | null,
  nonce?: number,
): void {
  const next =
    typeof sceneId === "string" && sceneId.trim().length > 0
      ? sceneId.trim()
      : null;

  forcedOpenSceneId = next;
  openSceneNonce =
    next !== null
      ? typeof nonce === "number" && nonce > 0
        ? nonce
        : Date.now()
      : 0;
  notifySaveField(TARGET_SYNC_KEY);
}

/**
 * 同步强制目标 id（场景内跳转）；不递增 nonce。
 *
 * @param sceneId - 场景定义 id；空串 / null 清除
 */
export function setForcedOpenSceneId(sceneId: string | null): void {
  const next =
    typeof sceneId === "string" && sceneId.trim().length > 0
      ? sceneId.trim()
      : null;

  if (forcedOpenSceneId === next) {
    return;
  }

  forcedOpenSceneId = next;
  notifySaveField(TARGET_SYNC_KEY);
}

/**
 * @returns 当前强制目标场景 id；无则为 null
 */
export function getForcedOpenSceneId(): string | null {
  return forcedOpenSceneId;
}

/**
 * @returns 方法开场代数；0 表示无待应用的方法开场
 */
export function getOpenSceneNonce(): number {
  return openSceneNonce;
}

/**
 * 订阅强制目标 / nonce 变化（供壳层 Hook 使用）。
 *
 * @param listener - 变更回调
 * @returns 取消订阅
 */
export function subscribeForcedOpenSceneId(listener: () => void): () => void {
  return subscribeSaveField((key) => {
    if (key === TARGET_SYNC_KEY) {
      listener();
    }
  });
}
