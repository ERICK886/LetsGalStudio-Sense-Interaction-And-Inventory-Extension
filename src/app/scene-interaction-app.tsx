/**
 * scene-interaction-app.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.4.0
 *
 * 运行时程序 App：RuntimeShell / PlayerShell（纯场景画面）。
 * - 快捷栏：玩家用 React 紧凑 `backpack-hud`（Visual UI 待 ui/ 恢复后再接）
 * - 全屏背包：独立程序 `backpack`
 *
 * - 预览：settings 沙箱 + **内嵌** HudShell（勿 ui.show，以免顶掉预览容器）
 * - 玩家会话：slot save + ui.show(backpack-hud)
 * - ThemeProvider 根背景 transparent；场景壳根 pointer-events:none
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useExtensionContext,
  type ExtensionProps,
  type SaveAPI,
} from "@avg-studio/sdk";
import { SCENE_INTERACTION_UI_ID } from "../methods/scene-methods";
import {
  installHudForeignCover,
  subscribeHudForeignCover,
} from "../runtime/hud-foreign-cover";
import {
  endPlayerSessionWait,
  isPlayerSessionPending,
} from "../runtime/player-session";
import {
  clearPlayerOverlaySessionIfEpoch,
  forceClearPlayerOverlaySession,
  isPlayerOverlaySessionActive,
  markPlayerOverlaySession,
  setHudUiSession,
  setSceneInteractionRestoreProps,
} from "../runtime/suspend-overlay-for-fragment";
import { closeVisualInventoryHud } from "../runtime/visual-inventory-hud";
import {
  BACKPACK_HUD_MODULE_ID,
  BACKPACK_MODULE_ID,
  SCENE_INTERACTION_MODULE_ID,
} from "../shared/module-ids";
import { getTightBackpackHudShowOptions } from "../store/hud-ui-show";
import { logDebug, logError, logWarn } from "../shared/logger";
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
  onContinueStory?: () => void | Promise<void>;
}>;

type PlayerShellComponent = React.ComponentType<{
  save: SaveAPI<SceneInteractionSaveMap>;
  onRequestClose: () => void | Promise<void>;
}>;

type HudShellComponent = React.ComponentType<{
  compactHost?: boolean;
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

  /** 绑定库存会话，供背包层共享；Studio 预览为内存壳，玩家为权威 slot */
  useEffect(
    () =>
      bindInventoryPersistence(effectiveSave, {
        preview: !isPlayerRuntime,
      }),
    [effectiveSave, isPlayerRuntime],
  );

  /**
   * 系统设置等界面打开时隐藏快捷栏，避免盖住其它 UI。
   */
  useEffect(() => installHudForeignCover(ctx), [ctx]);

  /**
   * 片段结束后按当前会话形态恢复 ui.show props；
   * 只要场景交互壳已挂载就标记 playerOverlaySession。
   *
   * 注意：`openSceneInteraction` 会在 method 侧先登记 modal props；
   * 此处仅在 React 确实收到 player* props 时加固，**禁止**预览路径写 `{}` 覆盖。
   */
  useEffect(() => {
    if (isPlayerModal) {
      setSceneInteractionRestoreProps({
        playerPresentation: true,
        playerSession: "modal",
      });
    } else if (playerPresentation === true) {
      setSceneInteractionRestoreProps({ playerPresentation: true });
    }

    const epoch = markPlayerOverlaySession();

    return () => {
      clearPlayerOverlaySessionIfEpoch(epoch);
    };
  }, [isPlayerModal, playerPresentation]);

  /**
   * 仅玩家运行时叠快捷栏：先走 React 紧凑包围盒（可靠）。
   * Visual UI（inventory-hud.json）缺失时 open 会失败并干扰调试；
   * 有界面文件后再切回 preferVisual。
   * Studio 程序预览勿 ui.show，以免顶掉当前容器导致场景消失。
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
          { compactHost: true },
          getTightBackpackHudShowOptions(ctx),
        );

        if (!cancelled) {
          setHudUiSession(true);
        }
      } catch (err) {
        if (!cancelled) {
          setHudUiSession(false);
          logError(
            "scene-interaction-app",
            "自动显示快捷栏 HUD 失败",
            err,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      setHudUiSession(false);

      try {
        closeVisualInventoryHud(ctx);
      } catch {
        // Visual 可能未打开
      }

      void ctx.ui.hide(BACKPACK_HUD_MODULE_ID).catch(() => {
        // 忽略
      });
    };
  }, [ctx, isPlayerRuntime]);

  const handlePlayerRequestClose = useCallback(async (): Promise<void> => {
    const sessionPending = isPlayerSessionPending();
    const overlaySession = isPlayerOverlaySessionActive();

    logDebug("continue-story", "handlePlayerRequestClose 开始", {
      playerOverlaySession: overlaySession,
      sessionPending,
      t: Date.now(),
    });

    if (!sessionPending) {
      logWarn(
        "continue-story",
        "继续剧情时无阻塞门闩（endWait 将 no-op）。若剧本用的是「打开场景」而非「打开场景交互（阻塞）」，关闭 UI 后剧本不会因此前进一步；跳转片段后再关闭更容易把 flow 指针对乱。请改用 open-scene-interaction。",
        { sessionPending, overlaySession },
      );
    }

    try {
      await ctx.ui.hide(BACKPACK_MODULE_ID);
      logDebug("continue-story", "已 hide 全屏背包", { t: Date.now() });
    } catch {
      // 全屏背包可能未打开
      logDebug("continue-story", "hide 全屏背包跳过/失败", { t: Date.now() });
    }

    try {
      closeVisualInventoryHud(ctx);
      await ctx.ui.hide(BACKPACK_HUD_MODULE_ID);
      logDebug("continue-story", "已 hide HUD", { t: Date.now() });
    } catch {
      // HUD 可能未打开
      logDebug("continue-story", "hide HUD 跳过/失败", { t: Date.now() });
    }

    try {
      await ctx.ui.hide(SCENE_INTERACTION_UI_ID);
      logDebug("continue-story", "已 hide 场景交互", { t: Date.now() });
    } catch (err) {
      logError(
        "scene-interaction-app",
        "onRequestClose: ctx.ui.hide 失败",
        err,
      );
    }

    endPlayerSessionWait();
    forceClearPlayerOverlaySession();
    logDebug("continue-story", "handlePlayerRequestClose 结束（已 endWait）", {
      sessionPending: isPlayerSessionPending(),
      t: Date.now(),
    });
  }, [ctx]);

  const [RuntimeShellComp, setRuntimeShellComp] =
    useState<RuntimeShellComponent | null>(null);
  const [PlayerShellComp, setPlayerShellComp] =
    useState<PlayerShellComponent | null>(null);
  const [HudShellComp, setHudShellComp] =
    useState<HudShellComponent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hudCovered, setHudCovered] = useState(false);

  useEffect(() => subscribeHudForeignCover(setHudCovered), []);

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
         * 程序预览：同树内嵌 HUD（设计绝对坐标），避免 ui.show 顶掉场景。
         */
        if (!isPlayerRuntime) {
          const hudMod = await import("../backpack/hud-shell");

          if (!cancelled) {
            setHudShellComp(() => hudMod.HudShell);
          }
        } else if (!cancelled) {
          setHudShellComp(null);
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
    <ThemeProvider initialMode={themeMode} rootBackground="transparent">
      <div
        data-testid="scene-interaction-app-root"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          minHeight: 0,
          background: "transparent",
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
          <RuntimeShellComp
            save={effectiveSave}
            onContinueStory={handlePlayerRequestClose}
          />
        ) : null}

        {!isPlayerRuntime && HudShellComp && !hudCovered ? (
          <div
            data-testid="scene-interaction-preview-hud"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 90,
              pointerEvents: "none",
            }}
          >
            <HudShellComp compactHost={false} />
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
