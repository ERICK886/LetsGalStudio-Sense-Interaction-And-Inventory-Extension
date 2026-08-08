/**
 * use-scene-ui-config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * React Hook：订阅场景 UI 预设（editor.sceneUiJson）。
 * 同时支持 cross 读取与进程内 settings-sync 通知，UI 编辑后预览/运行时自动刷新。
 *
 * 返回的 SceneUiConfig 已规范化：
 * - `itemToast`：获得物品 Toast 全局默认
 * - `hotspotHover`：交互点悬停全局预设（不含 useGlobal）
 */

import { useEffect, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import type { SceneUiConfig } from "../domain/types";
import { readSceneUiConfig, SCENE_UI_JSON_KEY } from "./scene-ui-settings";
import { subscribeSettingsField } from "./settings-sync";

/**
 * 订阅场景 UI 预设（itemToast + hotspotHover）。
 *
 * 首次挂载与 `editor.sceneUiJson` 写入后均会拉取最新值并触发重渲染。
 *
 * @returns 当前规范化的 `SceneUiConfig`
 *
 * @example
 * ```tsx
 * const sceneUi = useSceneUiConfig();
 * sceneUi.itemToast.placement;   // "above" | "below" | ...
 * sceneUi.hotspotHover.enabled;  // 全局悬停总开关
 * ```
 */
export function useSceneUiConfig(): SceneUiConfig {
  const ctx = useExtensionContext();
  const [config, setConfig] = useState<SceneUiConfig>(() =>
    readSceneUiConfig(ctx),
  );

  useEffect(() => {
    // ctx 可能变更（理论上单实例不会），挂载/卸载时重新读取一次保证一致
    setConfig(readSceneUiConfig(ctx));

    return subscribeSettingsField((key) => {
      if (key === SCENE_UI_JSON_KEY) {
        setConfig(readSceneUiConfig(ctx));
      }
    });
  }, [ctx]);

  return config;
}
