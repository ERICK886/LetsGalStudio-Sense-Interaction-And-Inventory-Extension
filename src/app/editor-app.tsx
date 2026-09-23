/**
 * editor-app.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.3
 *
 * 编辑器程序（`@extension id: editor`）根组件：
 * - 编辑态：EditorShell
 * - 预览态：本程序内 PreviewShell（顶栏 + RuntimeShell，settings 沙箱；≠ 玩家 slot）
 * - 「运行预览」始终以左侧当前编辑/选中场景为预览场景
 * - 预览非编辑器主场景时预置返回栈（主场景 = defaultSceneId，否则场景库首项）
 */

import { ChakraProvider, createSystem, defaultConfig } from "@chakra-ui/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useExtensionContext,
  type ExtensionContext,
  type ExtensionProps,
  type SaveAPI,
} from "@avg-studio/sdk";
import { parseScenesLibraryJson } from "../domain/serialize";
import { stringifySceneReturnStack } from "../domain/scene-return-stack";
import { logError } from "../shared/logger";
import { readAuthorSetting } from "../store/author-settings";
import { setForcedOpenSceneId } from "../store/open-scene-target";
import { createSettingsPreviewSave } from "../store/preview-save";
import { readScenesLibraryJson } from "../store/scenes-persistence";
import type { SceneInteractionSaveMap } from "../store/save-types";
import { ThemeProvider } from "../theme/theme-provider";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  rootTypographyStyle,
} from "../theme/theme-provider";
import type { ThemeMode } from "../theme/tokens";

const editorUiSystem = createSystem({
  ...defaultConfig,
  cssVarsRoot: "[data-extension-editor-root]",
  preflight: false,
  globalCss: {},
});

/**
 * 解析编辑器预览用的「主场景」id。
 *
 * 优先级：`defaultSceneId` → 场景库首个场景 id → `""`。
 *
 * @param ctx - 扩展上下文
 * @param defaultSceneId - 已 trim 的默认场景 id（可为空）
 * @returns 主场景 id；库空且无默认时为 `""`
 *
 * @example
 * ```ts
 * resolvePreviewMainSceneId(ctx, "home"); // "home"
 * resolvePreviewMainSceneId(ctx, "");     // 库中首个场景 id 或 ""
 * ```
 */
function resolvePreviewMainSceneId(
  ctx: ExtensionContext,
  defaultSceneId: string,
): string {
  if (defaultSceneId.length > 0) {
    return defaultSceneId;
  }

  try {
    const raw = readScenesLibraryJson((key) => readAuthorSetting(ctx, key));
    const lib = parseScenesLibraryJson(raw);
    const first = lib.scenes[0];

    return first !== undefined ? first.id : "";
  } catch (err) {
    logError("preview", "解析主场景（场景库首项）失败", err);

    return "";
  }
}

/**
 * 计算进入预览时应写入的返回栈 JSON。
 *
 * - 预览场景与主场景不同且二者均非空 → `["主场景id"]`
 * - 否则 → `"[]"`（预览的就是主场景，无需返回）
 *
 * @param previewSceneId - 即将预览的场景 id
 * @param mainSceneId - 主场景 id
 * @returns `sceneReturnStackJson` 字符串
 */
function buildPreviewReturnStackJson(
  previewSceneId: string,
  mainSceneId: string,
): string {
  if (
    previewSceneId.length > 0 &&
    mainSceneId.length > 0 &&
    previewSceneId !== mainSceneId
  ) {
    return stringifySceneReturnStack([mainSceneId]);
  }

  return "[]";
}

/**
 * 编辑器顶部分区（与 editor-shell 保持一致）。
 */
type EditorSection = "scenes" | "items" | "recipes" | "ui";

/**
 * 编辑器 App 本地模式：作者编辑 vs 运行预览。
 */
type EditorAppMode = "edit" | "preview";

/**
 * EditorApp 对外 props（编辑器无玩家 save 注入）。
 */
export interface EditorAppProps extends ExtensionProps {}

/**
 * 进入运行预览时的可选参数。
 *
 * @property sceneId - 左侧场景列表当前选中的场景 id；缺省则回退 defaultSceneId
 */
export type EnterPreviewOptions = {
  sceneId?: string | null;
};

/**
 * 异步加载后的编辑壳 props。
 */
type EditorShellComponent = React.ComponentType<{
  editorSection: EditorSection;
  onEditorSectionChange: (section: EditorSection) => void;
  /**
   * @param enabled - true → 回编辑；false → 进预览
   * @param options - 进预览时传入左侧选中场景等
   */
  onSetEditMode: (enabled: boolean, options?: EnterPreviewOptions) => void;
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
   * @param options - 进预览时的选项；`sceneId` 为左侧列表当前选中场景
   *
   * @remarks
   * 预览场景优先级：左侧选中 id → settings.defaultSceneId → 空
   * （空时 PreviewShell 会再回退场景库首项）。
   * 主场景：`defaultSceneId`，否则场景库首项；预览非主场景时种子返回栈为 `[主场景]`。
   * 使用 `preferOverrideSceneId` 覆盖沙箱中上次预览残留的场景 id。
   */
  const handleSetEditMode = useCallback(
    (enabled: boolean, options?: EnterPreviewOptions): void => {
      if (enabled) {
        setForcedOpenSceneId(null);
        setMode("edit");
        setPreviewSave(null);

        return;
      }

      try {
        const selectedId =
          typeof options?.sceneId === "string" ? options.sceneId.trim() : "";

        const defaultSceneId = String(
          readAuthorSetting(ctx, "defaultSceneId") ?? "",
        ).trim();

        const mainSceneId = resolvePreviewMainSceneId(ctx, defaultSceneId);

        /** 预览目标 = 当前编辑选中场景；无选中时才回退库首项 / 编辑器主场景 */
        let previewSceneId = selectedId;

        if (previewSceneId.length === 0) {
          previewSceneId = resolvePreviewMainSceneId(ctx, "");
        }

        if (previewSceneId.length === 0) {
          previewSceneId = mainSceneId;
        }

        if (previewSceneId.length === 0) {
          logError(
            "editor-app",
            "进入运行预览失败：场景库为空，且无当前选中场景",
          );

          return;
        }

        const sceneReturnStackJson = buildPreviewReturnStackJson(
          previewSceneId,
          mainSceneId,
        );

        /**
         * 强制目标 + 沙箱 current/main 均对齐当前编辑场景，
         * 避免剧本残留的 forcedOpenSceneId / 编辑器主场景盖住预览。
         */
        setForcedOpenSceneId(previewSceneId);
        setPreviewSave(
          createSettingsPreviewSave(
            ctx,
            {
              currentSceneId: previewSceneId,
              mainSceneId: previewSceneId,
              sceneReturnStackJson,
              isEditMode: false,
            },
            {
              resetReturnStack: true,
              preferOverrideSceneId: true,
            },
          ),
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
    <ChakraProvider value={editorUiSystem}>
      <ThemeProvider
        initialMode={themeMode}
        /**
         * 预览用不透明底：顶栏占高后场景 letterbox 两侧若透明会透出
         * Studio 下层图；编辑态沿用主题默认底。
         */
        rootBackground={mode === "preview" ? "#141418" : undefined}
        /**
         * 编辑器顶栏 /「编辑」按钮必须可点；
         * 不可沿用玩家叠层的 pointer-events:none 默认。
         */
        rootPointerEvents="auto"
      >
        <div
          data-testid="editor-app-root"
          data-extension-editor-root=""
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            minHeight: 0,
            background: mode === "preview" ? "#141418" : undefined,
            pointerEvents: "auto",
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
    </ChakraProvider>
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
