/** 全局与场景级 HUD 显示状态，供 Visual HUD 与 React 回退共用。 */
import type { ExtensionContext } from "@avg-studio/sdk";
import type { SceneDefinition } from "../domain/types";
import { findScene } from "../domain/scene-registry";
import { parseScenesLibraryJson } from "../domain/serialize";
import { getForcedOpenSceneId, subscribeForcedOpenSceneId } from "./open-scene-target";
import { readAuthorSetting } from "./author-settings";
import { readShowOpenBagButton, SHOW_OPEN_BAG_BUTTON_KEY } from "./hud-settings";
import { readScenesLibraryJson, SCENES_LIBRARY_SETTINGS_KEY } from "./scenes-persistence";
import { subscribeSaveField } from "./save-sync";
import { subscribeSettingsField } from "./settings-sync";
import { getSlotSave } from "./slot-save-bridge";

export interface SceneHudVisibility {
  showQuickbar: boolean;
  showOpenBagButton: boolean;
}

export function sceneHudVisibility(
  scene: SceneDefinition | null | undefined,
  globalShowOpenBagButton = true,
): SceneHudVisibility {
  return {
    showQuickbar: scene?.showQuickbar !== false,
    showOpenBagButton: globalShowOpenBagButton && scene?.showOpenBagButton !== false,
  };
}

/** 玩家 HUD 从权威存档解析场景设置，并应用全局背包按钮开关。 */
export function readSceneHudVisibility(ctx: ExtensionContext): SceneHudVisibility {
  const library = parseScenesLibraryJson(
    readScenesLibraryJson((key) => readAuthorSetting(ctx, key)),
  );
  const globalShowOpenBagButton = readShowOpenBagButton(ctx);
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
    if (scene) return sceneHudVisibility(scene, globalShowOpenBagButton);
  }
  return sceneHudVisibility(library.scenes[0], globalShowOpenBagButton);
}

/** 场景切换或编辑器保存场景、全局按钮设置后刷新 HUD。 */
export function subscribeSceneHudVisibility(listener: () => void): () => void {
  const offSave = subscribeSaveField((key) => {
    if (key === "currentSceneId" || key === "mainSceneId") listener();
  });
  const offSettings = subscribeSettingsField((key) => {
    if (key === SCENES_LIBRARY_SETTINGS_KEY || key === "defaultSceneId" ||
        key === SHOW_OPEN_BAG_BUTTON_KEY) listener();
  });
  const offForced = subscribeForcedOpenSceneId(listener);
  return () => { offSave(); offSettings(); offForced(); };
}
