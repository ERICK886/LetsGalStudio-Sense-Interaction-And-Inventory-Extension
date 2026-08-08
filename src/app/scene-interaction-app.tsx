/**
 * scene-interaction-app.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.2
 *
 * 运行时程序 App：RuntimeShell / PlayerShell（纯场景画面）。
 * 背包 UI 由独立程序 `backpack-hud` 负责。
 *
 * - 预览（Studio 程序预览）：settings 沙箱 + **内嵌** BackpackShell
 *   （不可 ctx.ui.show 背包，否则会顶掉当前预览容器，场景消失）
 * - 玩家会话：slot save + ctx.ui.show(backpack-hud) 叠层
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useExtensionContext,
  type ExtensionProps,
  type SaveAPI,
} from "@avg-studio/sdk";
import { SCENE_INTERACTION_UI_ID } from "../methods/scene-methods";
import { endPlayerSessionWait } from "../runtime/player-session";
import {
  BACKPACK_HUD_MODULE_ID,
  SCENE_INTERACTION_MODULE_ID,
} from "../shared/module-ids";
import { logError } from "../shared/logger";
import { readAuthorSetting } from "../store/author-settings";
import { bindInventoryPersistence } from "../store/inventory-session";
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
 * SceneInteractionApp 对外 props。
 */
export interface SceneInteractionAppProps extends ExtensionProps {
  save: SaveAPI<SceneInteractionSaveMap>;
  playerPresentation?: boolean;
  playerSession?: "modal";
}

type RuntimeShellComponent = React.ComponentType<{
  save: SaveAPI<SceneInteractionSaveMap>;
}>;

type PlayerShellComponent = React.ComponentType<{
  save: SaveAPI<SceneInteractionSaveMap>;
  onRequestClose: () => void | Promise<void>;
}>;

type BackpackShellComponent = React.ComponentType<{
  openBackpack?: boolean;
}>;

/**
 * @param props.message - 提示
 * @param props.themeMode - 主题
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
      data-testid="scene-interaction-mount-placeholder"
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
        场景交互
      </div>
      <div style={{ fontSize: FONT_SIZE_DEFAULT, color: muted }}>{message}</div>
    </div>
  );
}

/**
 * @param props.save - 存档
 * @param props.playerPresentation - 玩家 openScene
 * @param props.playerSession - modal 时 PlayerShell
 */
function SceneInteractionAppContent({
  save,
  playerPresentation,
  playerSession,
}: {
  save: SaveAPI<SceneInteractionSaveMap>;
  playerPresentation?: boolean;
  playerSession?: "modal";
}): React.ReactElement {
  const ctx = useExtensionContext();
  const isPlayerModal = playerSession === "modal";
  /**
   * 玩家运行时：openScene(playerPresentation) / openSceneInteraction(modal)。
   * Studio 程序预览无此标记 → 走扩展 settings 沙箱，不写玩家 slot。
   */
  const isPlayerRuntime =
    isPlayerModal || playerPresentation === true;

  const themeRaw = readAuthorSetting(ctx, "theme");
  const themeMode: ThemeMode = themeRaw === "light" ? "light" : "dark";

  const effectiveSave = useMemo((): SaveAPI<SceneInteractionSaveMap> => {
    if (isPlayerRuntime) {
      return save;
    }

    const defaultSceneId = String(
      readAuthorSetting(ctx, "defaultSceneId") ?? "",
    ).trim();

    return createSettingsPreviewSave(ctx, {
      currentSceneId: defaultSceneId,
      isEditMode: false,
    });
  }, [ctx, isPlayerRuntime, save]);

  /** 绑定库存会话，供背包层共享 */
  useEffect(
    () => bindInventoryPersistence(effectiveSave),
    [effectiveSave],
  );

  /**
   * 仅玩家运行时用 ui.show 叠背包。
   * Studio 程序预览若 show 另一个程序，会顶掉当前容器导致场景消失。
   */
  useEffect(() => {
    if (!isPlayerRuntime) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await ctx.ui.show(
          BACKPACK_HUD_MODULE_ID,
          {},
          {
            size: "(100%, 100%)",
            position: "(0, 0)",
            interactable: true,
          },
        );
      } catch (err) {
        if (!cancelled) {
          logError(
            "scene-interaction-app",
            "自动显示 backpack-hud 失败",
            err,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ctx, isPlayerRuntime]);

  const handlePlayerRequestClose = useCallback(async (): Promise<void> => {
    try {
      await ctx.ui.hide(BACKPACK_HUD_MODULE_ID);
    } catch {
      // 背包可能未打开
    }

    try {
      await ctx.ui.hide(SCENE_INTERACTION_UI_ID);
    } catch (err) {
      logError(
        "scene-interaction-app",
        "onRequestClose: ctx.ui.hide 失败",
        err,
      );
    }

    endPlayerSessionWait();
  }, [ctx]);

  const [RuntimeShellComp, setRuntimeShellComp] =
    useState<RuntimeShellComponent | null>(null);
  const [PlayerShellComp, setPlayerShellComp] =
    useState<PlayerShellComponent | null>(null);
  const [BackpackShellComp, setBackpackShellComp] =
    useState<BackpackShellComponent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoadError(null);

    if (isPlayerModal) {
      setPlayerShellComp(null);
    } else {
      setRuntimeShellComp(null);
    }

    (async () => {
      try {
        if (isPlayerModal) {
          const playerMod = await import("../runtime/player-shell");

          if (!cancelled) {
            setPlayerShellComp(() => playerMod.PlayerShell);
          }
        } else {
          const runtimeMod = await import("../runtime/runtime-shell");

          if (!cancelled) {
            setRuntimeShellComp(() => runtimeMod.RuntimeShell);
          }
        }

        /**
         * 程序预览：同树内嵌背包，避免 ui.show 顶掉场景。
         */
        if (!isPlayerRuntime) {
          const bagMod = await import("../backpack/backpack-shell");

          if (!cancelled) {
            setBackpackShellComp(() => bagMod.BackpackShell);
          }
        } else if (!cancelled) {
          setBackpackShellComp(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);

          console.error(
            `[${SCENE_INTERACTION_MODULE_ID}] 加载界面壳失败`,
            err,
          );
          setLoadError(message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPlayerModal, isPlayerRuntime]);

  const shellReady = isPlayerModal
    ? PlayerShellComp != null
    : RuntimeShellComp != null;

  return (
    <ThemeProvider initialMode={themeMode}>
      <div
        data-testid="scene-interaction-app-root"
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
            message="正在加载场景交互界面…"
          />
        ) : isPlayerModal && PlayerShellComp ? (
          <PlayerShellComp
            save={effectiveSave}
            onRequestClose={handlePlayerRequestClose}
          />
        ) : RuntimeShellComp ? (
          <RuntimeShellComp save={effectiveSave} />
        ) : null}

        {!isPlayerRuntime && BackpackShellComp ? (
          <div
            data-testid="scene-interaction-preview-backpack"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 90,
              pointerEvents: "none",
            }}
          >
            <BackpackShellComp />
          </div>
        ) : null}
      </div>
    </ThemeProvider>
  );
}

/**
 * 场景交互运行时根组件。
 *
 * @param props - 含 save / playerSession
 */
export function SceneInteractionApp(
  props: SceneInteractionAppProps,
): React.ReactElement {
  const { save, playerPresentation, playerSession } = props;

  if (!save) {
    return (
      <MountPlaceholder
        themeMode="dark"
        message="存档 API 未注入（save 缺失）"
      />
    );
  }

  return (
    <SceneInteractionAppContent
      save={save}
      playerPresentation={playerPresentation}
      playerSession={playerSession}
    />
  );
}
