/**
 * scene-interaction-app.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.2
 *
 * 场景交互系统 App 壳：订阅 settings / save，按 allowEdit + isEditMode
 * 切换 EditorShell / RuntimeShell；维护 editorSection（场景 / 物品库）。
 * 物品库编辑 UI 在 EditorShell 的 `editorSection === "items"` 分支中实现。
 * RuntimeShell 注入 save，用于 currentSceneId / inventory / progress。
 */

import React, { useCallback, useState } from "react";
import {
  useExtensionContext,
  type ExtensionProps,
  type SaveAPI,
} from "@avg-studio/sdk";
import {
  EditorShell,
  type EditorSection,
} from "../editor/editor-shell";
import { RuntimeShell } from "../runtime/runtime-shell";
import type { SceneInteractionSaveMap } from "../store/save-types";
import { ThemeProvider } from "../theme/theme-provider";
import type { ThemeMode } from "../theme/tokens";

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
 * 解析「允许编辑」设置。
 *
 * Studio 预览里 `settings.useValue` 偶发返回 `undefined`（尚未合并 default），
 * 若用 `=== true` 会误判为禁止编辑。schema 默认值为 `true`，故仅在显式 false 时关闭。
 *
 * @param raw - settings.useValue / get 读到的原始值
 * @returns 是否允许进入编辑器
 */
function resolveAllowEdit(raw: unknown): boolean {
  return raw !== false && raw !== "false" && raw !== 0;
}

/**
 * 应用主内容：订阅 settings / save，切换 Editor / Runtime。
 *
 * @param props.save - 扩展注入的存档 API
 * @returns 主题包裹的双壳 UI
 */
function SceneInteractionAppContent({
  save,
}: {
  save: SaveAPI<SceneInteractionSaveMap>;
}): React.ReactElement {
  const ctx = useExtensionContext();

  const [allowEditRaw] = ctx.settings.useValue("allowEdit");
  const [themeSetting] = ctx.settings.useValue("theme");
  const [isEditMode] = save.useValue("isEditMode");

  /**
   * 编辑器顶部分区（App 本地状态；非 save / settings）。
   * `"scenes"` = 场景编辑；`"items"` = 物品库。
   */
  const [editorSection, setEditorSection] =
    useState<EditorSection>("scenes");

  /**
   * useValue 未就绪时回退 settings.get（含 schema default），再按「非 false 即允许」。
   */
  const allowEdit = resolveAllowEdit(
    allowEditRaw !== undefined ? allowEditRaw : ctx.settings.get("allowEdit"),
  );

  const themeMode: ThemeMode = themeSetting === "light" ? "light" : "dark";

  /**
   * allowEdit === false 时强制运行壳；否则跟随 save.isEditMode。
   */
  const isEditing = allowEdit && isEditMode === true;

  /**
   * 顶栏切换编辑/运行：写入 save.isEditMode。
   *
   * @param enabled - true 进入编辑；false 运行预览
   */
  const setEditMode = useCallback(
    (enabled: boolean) => {
      save.set("isEditMode", enabled);
    },
    [save],
  );

  return (
    <ThemeProvider initialMode={themeMode}>
      {isEditing ? (
        <EditorShell
          editorSection={editorSection}
          onEditorSectionChange={setEditorSection}
          onSetEditMode={setEditMode}
        />
      ) : (
        <RuntimeShell
          save={save}
          allowEdit={allowEdit}
          onSetEditMode={setEditMode}
        />
      )}
    </ThemeProvider>
  );
}

/**
 * 场景交互系统根组件（稳定导出，供 Extension.render 直接引用）。
 *
 * @param props - 含注入的 `save` API
 * @returns 全屏主题壳 + Editor / Runtime
 *
 * @example
 * ```tsx
 * // 由 Extension.render() 返回：
 * // { component: SceneInteractionApp, props: { save: this.save } }
 * ```
 *
 * @remarks
 * - `allowEdit === false` → 强制 RuntimeShell
 * - `isEditMode` 来自 save，顶栏切换写入 save
 * - `editorSection` 为 App 状态：`"scenes" | "items"`
 */
export function SceneInteractionApp(
  props: SceneInteractionAppProps,
): React.ReactElement {
  const { save } = props;

  if (!save) {
    return (
      <ThemeProvider initialMode="dark">
        <div
          data-testid="scene-interaction-missing-save"
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9A9AA6",
          }}
        >
          存档 API 未注入（save 缺失）
        </div>
      </ThemeProvider>
    );
  }

  return <SceneInteractionAppContent save={save} />;
}
