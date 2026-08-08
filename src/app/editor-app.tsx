/**
 * editor-app.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.1
 *
 * 编辑器程序（`@extension id: editor`）根组件：
 * - 编辑态：EditorShell
 * - 预览态：本程序内 PreviewShell（settings 沙箱存档；≠ 玩家 slot）
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useExtensionContext,
  type ExtensionProps,
  type SaveAPI,
} from "@avg-studio/sdk";
import { logError } from "../shared/logger";
import { readAuthorSetting } from "../store/author-settings";
import { createSettingsPreviewSave } from "../store/preview-save";
import type { SceneInteractionSaveMap } from "../store/save-types";
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
 * 编辑器 App 本地模式：作者编辑 vs 运行预览。
 */
type EditorAppMode = "edit" | "preview";

/**
 * EditorApp 对外 props（编辑器无玩家 save 注入）。
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
 * 异步加载后的预览壳 props。
 */
type PreviewShellComponent = React.ComponentType<{
  save: SaveAPI<SceneInteractionSaveMap>;
  onBackToEditor: (enabled: boolean) => void;
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
 * 编辑器主内容：编辑 / 预览在本程序内切换（不跳转 scene-interaction）。
 *
 * @returns 主题包裹的编辑器或预览 UI
 */
function EditorAppContent(): React.ReactElement {
  const ctx = useExtensionContext();
  const [themeSetting] = ctx.settings.useValue("theme");
  const themeMode: ThemeMode = themeSetting === "light" ? "light" : "dark";

  const [mode, setMode] = useState<EditorAppMode>("edit");
  const [editorSection, setEditorSection] =
    useState<EditorSection>("scenes");

  /**
   * 进入预览时挂接扩展 settings 沙箱存档（与玩家 slot 隔离，可反复测试）。
   * 用 previewSessionKey 强制 remount PreviewShell。
   */
  const [previewSessionKey, setPreviewSessionKey] = useState(0);
  const [previewSave, setPreviewSave] =
    useState<SaveAPI<SceneInteractionSaveMap> | null>(null);

  const [EditorShellComp, setEditorShellComp] =
    useState<EditorShellComponent | null>(null);

  const [PreviewShellComp, setPreviewShellComp] =
    useState<PreviewShellComponent | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * 顶栏「运行预览」/「编辑」切换。
   *
   * @param enabled - true → 回到编辑；false → 进入本程序 PreviewShell
   */
  const handleSetEditMode = useCallback(
    (enabled: boolean): void => {
      if (enabled) {
        setMode("edit");
        setPreviewSave(null);

        return;
      }

      try {
        const defaultSceneId = String(
          readAuthorSetting(ctx, "defaultSceneId") ?? "",
        ).trim();

        /**
         * 沙箱落在 scene-interaction.settings；
         * 若预览尚未选场景，则用编辑器 defaultSceneId 填入。
         */
        setPreviewSave(
          createSettingsPreviewSave(ctx, {
            currentSceneId: defaultSceneId,
            isEditMode: false,
          }),
        );
        setPreviewSessionKey((n) => n + 1);
        setMode("preview");
      } catch (err) {
        logError("editor-app", "进入运行预览失败", err);
      }
    },
    [ctx],
  );

  /**
   * 按模式异步加载 EditorShell / PreviewShell。
   */
  useEffect(() => {
    let cancelled = false;

    setLoadError(null);

    if (mode === "edit") {
      setEditorShellComp(null);
    } else {
      setPreviewShellComp(null);
    }

    (async () => {
      try {
        if (mode === "edit") {
          const mod = await import("../editor/editor-shell");

          if (cancelled) {
            return;
          }

          setEditorShellComp(() => mod.EditorShell);
        } else {
          const mod = await import("../editor/preview-shell");

          if (cancelled) {
            return;
          }

          setPreviewShellComp(() => mod.PreviewShell);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        const message = err instanceof Error ? err.message : String(err);

        console.error("[editor] 加载界面壳失败", err);
        setLoadError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const shellReady = useMemo(() => {
    if (mode === "edit") {
      return EditorShellComp != null;
    }

    return PreviewShellComp != null && previewSave != null;
  }, [mode, EditorShellComp, PreviewShellComp, previewSave]);

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
        ) : !shellReady ? (
          <MountPlaceholder
            themeMode={themeMode}
            message={
              mode === "preview" ? "正在加载运行预览…" : "正在加载编辑器…"
            }
          />
        ) : mode === "preview" && PreviewShellComp && previewSave ? (
          <PreviewShellComp
            key={previewSessionKey}
            save={previewSave}
            onBackToEditor={handleSetEditMode}
          />
        ) : EditorShellComp ? (
          <EditorShellComp
            editorSection={editorSection}
            onEditorSectionChange={setEditorSection}
            onSetEditMode={handleSetEditMode}
          />
        ) : null}
      </div>
    </ThemeProvider>
  );
}

/**
 * 编辑器程序根组件（稳定导出，供 Extension.render 直接引用）。
 *
 * @param _props - ExtensionProps
 * @returns 全屏编辑器 / 运行预览
 *
 * @remarks
 * 玩家实时运行在 `scene-interaction`；本程序的 PreviewShell 仅供作者调试。
 */
export function EditorApp(_props: EditorAppProps): React.ReactElement {
  return <EditorAppContent />;
}
