/** 场景级 HUD 显示状态，供 Visual HUD 与 React 回退共用。 */
import type { ExtensionContext } from "@avg-studio/sdk";
import type { SceneDefinition } from "../domain/types";
import { findScene } from "../domain/scene-registry";
import { parseScenesLibraryJson } from "../domain/serialize";
import { getForcedOpenSceneId, subscribeForcedOpenSceneId } from "./open-scene-target";
import { readAuthorSetting } from "./author-settings";
import { readScenesLibraryJson, SCENES_LIBRARY_SETTINGS_KEY } from "./scenes-persistence";
import { subscribeSaveField } from "./save-sync";
import { subscribeSettingsField } from "./settings-sync";
import { getSlotSave } from "./slot-save-bridge";

export interface SceneHudVisibility {
  showQuickbar: boolean;
  showOpenBagButton: boolean;
}

export function sceneHudVisibility(scene: SceneDefinition | null | undefined): SceneHudVisibility {
  return {
    showQuickbar: scene?.showQuickbar !== false,
    showOpenBagButton: scene?.showOpenBagButton !== false,
  };
}

/** 玩家 HUD 从权威存档中的场景 ID 解析设置；无场景时沿用全显示。 */
export function readSceneHudVisibility(ctx: ExtensionContext): SceneHudVisibility {
  const library = parseScenesLibraryJson(
    readScenesLibraryJson((key) => readAuthorSetting(ctx, key)),
  );
  const save = getSlotSave();
  const keys = [
    save?.get("currentSceneId"),
    getForcedOpenSceneId(),
    save?.get("mainSceneId"),
    readAuthorSetting(ctx, "defaultSceneId"),
  ];
  for (const key of keys) {
    if (typeof key !== "string" || !key.trim()) continue;
    const scene = findScene(library.scenes, key.trim());
    if (scene) return sceneHudVisibility(scene);
  }
  return sceneHudVisibility(library.scenes[0]);
}

/** 场景切换或编辑器保存场景设置后刷新 HUD。 */
export function subscribeSceneHudVisibility(listener: () => void): () => void {
  const offSave = subscribeSaveField((key) => {
    if (key === "currentSceneId" || key === "mainSceneId") listener();
  });
  const offSettings = subscribeSettingsField((key) => {
    if (key === SCENES_LIBRARY_SETTINGS_KEY || key === "defaultSceneId") listener();
  });
  const offForced = subscribeForcedOpenSceneId(listener);
  return () => { offSave(); offSettings(); offForced(); };
}
