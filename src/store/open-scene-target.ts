/**
 * open-scene-target.ts
 * 作者: 池水三两升
 * 日期: 2026-08-10
 * 版本: 0.1.0
 *
 * 打开场景交互时的强制目标场景 id（方法 → 壳层）。
 * 不依赖 Studio ui.show 是否把新 props 灌进已挂载树：
 * 叠层复用时仍能切到「散落的背包」而非残留的编辑器主场景。
 */

import { notifySaveField, subscribeSaveField } from "./save-sync";

/** 与 save-sync 共用总线的伪字段名 */
const TARGET_SYNC_KEY = "__openSceneTargetId";

/** 当前强制打开的场景 id；无则为 null */
let forcedOpenSceneId: string | null = null;

/**
 * 设置方法侧解析出的目标场景 id。
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
 * 订阅强制目标变化（供壳层 Hook 使用）。
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
