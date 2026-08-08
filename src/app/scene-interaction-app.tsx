/**
 * scene-interaction-app.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景交互系统 App 壳（占位）：展示标题与当前 isEditMode，供后续编辑器/运行时接入。
 */

import React from "react";
import {
  type ExtensionProps,
  type SaveAPI,
} from "@avg-studio/sdk";
import type { SceneInteractionSaveMap } from "../store/save-types";

/**
 * SceneInteractionApp 对外 props。
 *
 * `save` 由 Extension.render() 通过 props 注入；组件引用必须稳定，
 * 勿在 render 内新建匿名组件，否则 Studio 预览会反复 remount。
 */
export interface SceneInteractionAppProps extends ExtensionProps {
  /**
   * 强类型存档读写 API（来自扩展实例 `this.save`）。
   */
  save: SaveAPI<SceneInteractionSaveMap>;
}

/**
 * 场景交互系统根组件（占位 UI）。
 *
 * 当前仅渲染标题「场景交互系统」与存档中的 `isEditMode`，
 * 后续任务再挂接编辑器 / 运行时壳。
 *
 * @param props - 含注入的 `save` API
 * @returns React 元素
 *
 * @example
 * ```tsx
 * // 由 Extension.render() 返回：
 * // { component: SceneInteractionApp, props: { save: this.save } }
 * ```
 *
 * @remarks
 * 使用 `save.useValue("isEditMode")` 订阅字段变更并自动 re-render；
 * 勿在此组件内同步阻塞加载重模块，以免 Studio 预览挂载超时。
 */
export function SceneInteractionApp(
  props: SceneInteractionAppProps,
): React.ReactElement {
  const { save } = props;

  const [isEditMode] = save.useValue("isEditMode");

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        fontFamily: "system-ui, sans-serif",
        color: "#e8e8e8",
        background: "#1a1a1a",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>
        场景交互系统
      </h1>
      <p style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>
        isEditMode: {String(isEditMode)}
      </p>
    </div>
  );
}
