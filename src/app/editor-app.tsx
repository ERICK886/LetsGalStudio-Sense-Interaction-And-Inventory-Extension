/**
 * editor-app.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 编辑器程序（`@extension id: editor`）根组件：
 * 异步加载 EditorShell，避免 Studio 挂载超时。
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  useExtensionContext,
  type ExtensionProps,
} from "@avg-studio/sdk";
import {
  EDITOR_MODULE_ID,
  SCENE_INTERACTION_MODULE_ID,
} from "../shared/module-ids";
import { logError } from "../shared/logger";
import { ThemeProvider } from "../theme/theme-provider";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  rootTypographyStyle,
} from "../theme/theme-provider";
import type { ThemeMode } from "../theme/tokens";

/**
 * 编辑器顶部分区（与 editor-shell 保持一致）。
 */
type EditorSection = "scenes" | "items" | "recipes";

/**
 * EditorApp 对外 props（编辑器无 save 注入）。
 */
export interface EditorAppProps extends ExtensionProps {}

/**
 * 异步加载后的编辑壳 props。
 */
type EditorShellComponent = React.ComponentType<{
  editorSection: EditorSection;
  onEditorSectionChange: (section: EditorSection) => void;
  onSetEditMode: (enabled: boolean) => void;
}>;

/**
 * 全屏轻量占位。
 *
 * @param props.message - 提示文案
 * @param props.themeMode - 当前主题
 * @returns 占位 React 元素
 */
function MountPlaceholder({
  message,
  themeMode,
}: {
  message: string;
  themeMode: ThemeMode;
}): React.ReactElement {
  const bg = themeMode === "dark" ? "#17171B" : "#F7F5F4";
  const fg = themeMode === "dark" ? "#EDEDEF" : "#1C1A19";
  const muted = themeMode === "dark" ? "#8B8B95" : "#8A8582";

  return (
    <div
      data-testid="editor-mount-placeholder"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 12,
        background: bg,
        color: fg,
        ...rootTypographyStyle,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "3px solid #2EC4A4",
          borderTopColor: "transparent",
          animation: "si-spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes si-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: FONT_SIZE_TITLE + 2, fontWeight: 600 }}>
        场景编辑器
      </div>
      <div style={{ fontSize: FONT_SIZE_DEFAULT, color: muted }}>{message}</div>
    </div>
  );
}

/**
 * 编辑器主内容：订阅 theme，异步加载 EditorShell。
 *
 * 「运行预览」：隐藏本程序 UI，并显示 scene-interaction 预览壳。
 *
 * @returns 主题包裹的编辑器 UI
 */
function EditorAppContent(): React.ReactElement {
  const ctx = useExtensionContext();
  const [themeSetting] = ctx.settings.useValue("theme");
  const themeMode: ThemeMode = themeSetting === "light" ? "light" : "dark";

  const [editorSection, setEditorSection] =
    useState<EditorSection>("scenes");

  const [EditorShellComp, setEditorShellComp] =
    useState<EditorShellComponent | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * 退出编辑器并打开运行时预览（非玩家 modal）。
   *
   * @param enabled - 仅当 false 时执行「运行预览」；true 忽略（编辑器已打开）
   */
  const handleSetEditMode = useCallback(
    async (enabled: boolean): Promise<void> => {
      if (enabled) {
        return;
      }

      try {
        await ctx.ui.hide(EDITOR_MODULE_ID);
      } catch (err) {
        logError("editor-app", "运行预览: hide editor 失败", err);
      }

      try {
        await ctx.ui.show(
          SCENE_INTERACTION_MODULE_ID,
          {},
          {
            size: "(100%, 100%)",
            position: "(0, 0)",
            interactable: true,
          },
        );
      } catch (err) {
        logError(
          "editor-app",
          "运行预览: show scene-interaction 失败",
          err,
        );
      }
    },
    [ctx],
  );

  useEffect(() => {
    let cancelled = false;

    setLoadError(null);
    setEditorShellComp(null);

    (async () => {
      try {
        const mod = await import("../editor/editor-shell");

        if (cancelled) {
          return;
        }

        setEditorShellComp(() => mod.EditorShell);
      } catch (err) {
        if (cancelled) {
          return;
        }

        const message = err instanceof Error ? err.message : String(err);

        console.error("[editor] 加载 EditorShell 失败", err);
        setLoadError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ThemeProvider initialMode={themeMode}>
      <div
        data-testid="editor-app-root"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          minHeight: 0,
        }}
      >
        {loadError ? (
          <MountPlaceholder
            themeMode={themeMode}
            message={`加载失败：${loadError}`}
          />
        ) : !EditorShellComp ? (
          <MountPlaceholder
            themeMode={themeMode}
            message="正在加载编辑器…"
          />
        ) : (
          <EditorShellComp
            editorSection={editorSection}
            onEditorSectionChange={setEditorSection}
            onSetEditMode={(enabled) => {
              void handleSetEditMode(enabled);
            }}
          />
        )}
      </div>
    </ThemeProvider>
  );
}

/**
 * 编辑器程序根组件（稳定导出，供 Extension.render 直接引用）。
 *
 * @param _props - ExtensionProps（本程序无 save）
 * @returns 全屏编辑器壳
 *
 * @example
 * ```tsx
 * // Extension.render():
 * // { component: EditorApp, props: {} }
 * ```
 */
export function EditorApp(_props: EditorAppProps): React.ReactElement {
  return <EditorAppContent />;
}
