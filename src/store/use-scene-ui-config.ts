/**
 * use-scene-ui-config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * React Hook：订阅场景 UI 预设（editor.sceneUiJson）。
 * 同时支持 cross 读取与进程内 settings-sync 通知，UI 编辑后预览/运行时自动刷新。
 * 解析时传入当前设计分辨率，使返回按钮 / Toast 默认值随画布缩放。
 */

import { useEffect, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import type { SceneUiConfig } from "../domain/types";
import { readSceneUiConfig, SCENE_UI_JSON_KEY } from "./scene-ui-settings";
import { subscribeSettingsField } from "./settings-sync";
import { useDesignSize } from "./use-design-size";

/**
 * 订阅场景 UI 预设（itemToast + hotspotHover + sceneReturn）。
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
  const { size: designSize } = useDesignSize();
  const [config, setConfig] = useState<SceneUiConfig>(() =>
    readSceneUiConfig(ctx, designSize.width, designSize.height),
  );

  useEffect(() => {
    setConfig(readSceneUiConfig(ctx, designSize.width, designSize.height));

    return subscribeSettingsField((key) => {
      if (key === SCENE_UI_JSON_KEY) {
        setConfig(readSceneUiConfig(ctx, designSize.width, designSize.height));
      }
    });
  }, [ctx, designSize.height, designSize.width]);

  return config;
}
