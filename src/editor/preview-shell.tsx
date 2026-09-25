/**
 * preview-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.4.0
 *
 * 编辑器内「运行预览」薄壳：顶栏（返回编辑）+ 与玩家一致的 RuntimeShell。
 * `save` 为扩展 settings 沙箱，与玩家 slot 隔离。
 * 快捷栏以内嵌 HudShell 叠层显示（勿 ui.show，以免顶掉编辑器预览容器）；
 * 场景交互体直接复用 `RuntimeShell`，与 `scene-interaction` 非 modal 玩家路径同壳。
 *
 * 预览根/body 用不透明近黑铺底：顶栏占高后 letterbox 两侧透明会透出
 * Studio 下层场景图，故编辑器预览不能沿用玩家的全透明叠层。
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useExtensionContext,
  type SaveAPI,
} from "@avg-studio/sdk";
import { LETTERBOX_COLOR_BLACK } from "../domain/letterbox";
import { findScene } from "../domain/scene-registry";
import type { SceneDefinition } from "../domain/types";
import {
  installHudForeignCover,
  subscribeHudForeignCover,
} from "../runtime/hud-foreign-cover";
import { IconLabel } from "../shared/fa-icon";
import { bindInventoryPersistence } from "../store/inventory-session";
import { setForcedOpenSceneId } from "../store/open-scene-target";
import { useScenesLibrary } from "../store/scenes-persistence";
import type { SceneInteractionSaveMap } from "../store/save-types";
import { useSaveValue } from "../store/use-save-value";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";

type RuntimeShellComponent = React.ComponentType<{
  save: SaveAPI<SceneInteractionSaveMap>;
  openSceneId?: string;
  onContinueStory?: () => void | Promise<void>;
}>;

type HudShellComponent = React.ComponentType<{
  compactHost?: boolean;
  scene?: SceneDefinition | null;
}>;

/**
 * PreviewShell 组件属性。
 */
export interface PreviewShellProps {
  /**
   * 预览会话内存存档（与玩家 slot 隔离）。
   */
  save: SaveAPI<SceneInteractionSaveMap>;

  /**
   * 返回编辑器（顶栏「编辑」）。
   *
   * @param enabled - 恒为 true（进入编辑）
   */
  onBackToEditor: (enabled: boolean) => void;
}

/**
 * 预览顶栏按钮样式。
 *
 * @param tokens - 主题 token
 * @param variant - 按钮变体
 * @returns CSSProperties
 */
function topBarButtonStyle(
  tokens: ThemeTokens,
  variant: "default" | "primary" = "default",
): React.CSSProperties {
  const isPrimary = variant === "primary";

  return {
    appearance: "none",
    border: `1px solid ${isPrimary ? tokens.accent : tokens.borderStrong}`,
    background: isPrimary ? tokens.accent : tokens.bgSunken,
    color: isPrimary ? "#0B1210" : tokens.textPrimary,
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: isPrimary ? 600 : 500,
    cursor: "pointer",
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

/**
 * 根据 currentSceneId 与场景库解析当前场景；空 id 时回退首个场景。
 *
 * @param scenes - 场景列表
 * @param currentSceneId - 预览存档中的场景 id
 * @returns 场景定义或 null
 */
function resolveCurrentScene(
  scenes: SceneDefinition[],
  currentSceneId: string,
): SceneDefinition | null {
  if (scenes.length === 0) {
    return null;
  }

  if (currentSceneId) {
    const found = findScene(scenes, currentSceneId);

    if (found !== undefined) {
      return found;
    }
  }

  return scenes[0] ?? null;
}

/**
 * 编辑器运行预览：顶栏 + RuntimeShell（与玩家同壳）+ 内嵌 HudShell。
 *
 * @param props.save - settings 沙箱预览存档
 * @param props.onBackToEditor - 点「编辑」返回 EditorShell
 * @returns 带预览顶栏的运行时 UI
 *
 * @example
 * ```tsx
 * <PreviewShell
 *   save={previewSave}
 *   onBackToEditor={() => setMode("edit")}
 * />
 * ```
 */
export function PreviewShell({
  save,
  onBackToEditor,
}: PreviewShellProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();

  const [library] = useScenesLibrary();
  const [currentSceneId] = useSaveValue(save, "currentSceneId", ctx);
  const previewSceneId =
    typeof currentSceneId === "string" ? currentSceneId.trim() : "";

  /** 与编辑器选中场景对齐，防止剧本残留强制目标干扰预览 */
  useEffect(() => {
    if (previewSceneId.length > 0) {
      setForcedOpenSceneId(previewSceneId);
    }
  }, [previewSceneId]);

  const scene = useMemo(
    () => resolveCurrentScene(library.scenes, previewSceneId),
    [library.scenes, previewSceneId],
  );
  const sceneTitle = scene?.name ?? "（无场景）";

  const [RuntimeShellComp, setRuntimeShellComp] =
    useState<RuntimeShellComponent | null>(null);
  const [HudShellComp, setHudShellComp] =
    useState<HudShellComponent | null>(null);
  const [hudCovered, setHudCovered] = useState(false);

  /** 绑定库存会话；编辑器预览为内存壳，勿标权威 slot */
  useEffect(
    () => bindInventoryPersistence(save, { preview: true }),
    [save],
  );

  /** 系统设置等界面打开时隐藏内嵌 HUD */
  useEffect(() => installHudForeignCover(ctx), [ctx]);

  useEffect(() => subscribeHudForeignCover(setHudCovered), []);

  /**
   * 加载与玩家一致的 RuntimeShell，以及预览用内嵌 HudShell。
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [runtimeMod, hudMod] = await Promise.all([
          import("../runtime/runtime-shell"),
          import("../backpack/hud-shell"),
        ]);

        if (!cancelled) {
          setRuntimeShellComp(() => runtimeMod.RuntimeShell);
          setHudShellComp(() => hudMod.HudShell);
        }
      } catch (err) {
        console.warn("[editor-preview]", "加载 RuntimeShell / HudShell 失败", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 编辑器预览无阻塞剧情会话；「继续剧情」空操作。
   */
  const handleContinueStory = useCallback((): void => {
    console.info(
      "[editor-preview]",
      "continueStory：编辑器预览中忽略（无阻塞剧情会话）",
    );
  }, []);

  return (
    <div
      data-testid="preview-shell"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        position: "relative",
        background: LETTERBOX_COLOR_BLACK,
        color: tokens.textPrimary,
        pointerEvents: "auto",
      }}
    >
      <header
        data-testid="preview-top-bar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderBottom: `1px solid ${tokens.border}`,
          background: tokens.bgElevated,
          flexShrink: 0,
          boxShadow: "0 1px 0 rgba(0,0,0,0.25)",
          pointerEvents: "auto",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginRight: 4,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: tokens.accent,
              boxShadow: `0 0 0 3px ${tokens.accent}33`,
            }}
          />
          <span
            style={{
              fontSize: FONT_SIZE_TITLE,
              fontWeight: 650,
              color: tokens.textPrimary,
              letterSpacing: "0.02em",
            }}
          >
            运行预览
          </span>
        </div>

        <button
          type="button"
          data-testid="preview-mode-toggle"
          onClick={() => onBackToEditor(true)}
          style={topBarButtonStyle(tokens, "primary")}
        >
          <IconLabel icon="pen-to-square">编辑</IconLabel>
        </button>

        <div style={{ flex: 1 }} />

        <span
          style={{ fontSize: FONT_SIZE_DEFAULT, color: tokens.textMuted }}
        >
          {sceneTitle}
        </span>
      </header>

      <div
        data-testid="preview-body"
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          /**
           * 不透明铺底挡住 Studio 下层场景；指针仍穿透空白，
           * 交互点 / HUD / 返回钮各自 pointerEvents:auto。
           */
          background: LETTERBOX_COLOR_BLACK,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {RuntimeShellComp ? (
          <RuntimeShellComp
            key={`preview-${previewSceneId || "empty"}`}
            save={save}
            openSceneId={
              previewSceneId.length > 0 ? previewSceneId : undefined
            }
            onContinueStory={handleContinueStory}
          />
        ) : null}

        {HudShellComp && !hudCovered ? (
          <div
            data-testid="preview-hud-overlay"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 90,
              pointerEvents: "none",
            }}
          >
            <HudShellComp compactHost={false} scene={scene} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
