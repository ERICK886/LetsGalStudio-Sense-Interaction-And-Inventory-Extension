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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  setSceneInteractionRestoreProps,
} from "../runtime/suspend-overlay-for-fragment";
import { closeVisualInventoryHud } from "../runtime/visual-inventory-hud";
import { startAutoHudSession } from "../runtime/auto-hud-session";
import {
  BACKPACK_HUD_MODULE_ID,
  BACKPACK_MODULE_ID,
  SCENE_INTERACTION_MODULE_ID,
} from "../shared/module-ids";
import { logDebug, logError, logWarn } from "../shared/logger";
import { readAuthorSetting } from "../store/author-settings";
import { useAutoShowHud } from "../store/use-auto-show-hud";
import { bindInventoryPersistence } from "../store/inventory-session";
import { setMethodOpenSceneTarget } from "../store/open-scene-target";
import { setReturnButtonVisibleOverride } from "../store/return-button-session";
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
  /**
   * 方法侧已解析的目标场景 id（经 ui.show 直传）。
   * 优先于 save.currentSceneId，避免首帧回退到编辑器主场景。
   */
  openSceneId?: string;
  /**
   * 方法开场代数；变化时壳层强制覆盖残留 currentSceneId。
   */
  openNonce?: number;
  /**
   * 返回按钮可见性覆盖；未传则跟随场景 UI 全局。
   */
  showReturnButton?: boolean | null;
}

type RuntimeShellComponent = React.ComponentType<{
  save: SaveAPI<SceneInteractionSaveMap>;
  openSceneId?: string;
  openNonce?: number;
  showReturnButton?: boolean | null;
  onContinueStory?: () => void | Promise<void>;
}>;

type PlayerShellComponent = React.ComponentType<{
  save: SaveAPI<SceneInteractionSaveMap>;
  openSceneId?: string;
  openNonce?: number;
  showReturnButton?: boolean | null;
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
  openSceneId,
  openNonce = 0,
  showReturnButton,
}: {
  save: SaveAPI<SceneInteractionSaveMap>;
  playerPresentation?: boolean;
  playerSession?: "modal";
  openSceneId?: string;
  openNonce?: number;
  showReturnButton?: boolean | null;
}): React.ReactElement {
  const ctx = useExtensionContext();
  const isPlayerModal = playerSession === "modal";
  const forcedOpenSceneId =
    typeof openSceneId === "string" ? openSceneId.trim() : "";
  const forcedOpenNonce =
    typeof openNonce === "number" && openNonce > 0 ? openNonce : 0;
  const returnButtonOverride =
    typeof showReturnButton === "boolean" ? showReturnButton : null;
  /**
   * 玩家运行时：openScene(playerPresentation) / openSceneInteraction(modal)。
   * Studio 程序预览无此标记 → 走扩展 settings 沙箱，不写玩家 slot。
   */
  const isPlayerRuntime =
    isPlayerModal || playerPresentation === true;

  const autoShowHud = useAutoShowHud(ctx);
  const hudWantedRef = useRef(isPlayerRuntime && autoShowHud);
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
      mainSceneId: defaultSceneId,
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
        ...(forcedOpenSceneId.length > 0
          ? { openSceneId: forcedOpenSceneId }
          : {}),
        ...(forcedOpenNonce > 0 ? { openNonce: forcedOpenNonce } : {}),
        ...(typeof returnButtonOverride === "boolean"
          ? { showReturnButton: returnButtonOverride }
          : {}),
      });
    } else if (playerPresentation === true) {
      setSceneInteractionRestoreProps({
        playerPresentation: true,
        ...(forcedOpenSceneId.length > 0
          ? { openSceneId: forcedOpenSceneId }
          : {}),
        ...(forcedOpenNonce > 0 ? { openNonce: forcedOpenNonce } : {}),
        ...(typeof returnButtonOverride === "boolean"
          ? { showReturnButton: returnButtonOverride }
          : {}),
      });
    }

    const epoch = markPlayerOverlaySession();

    return () => {
      clearPlayerOverlaySessionIfEpoch(epoch);
    };
  }, [isPlayerModal, playerPresentation, forcedOpenSceneId, forcedOpenNonce, returnButtonOverride]);

  /**
   * 仅玩家运行时叠快捷栏：全屏 + interactable:false，
   * HudShell 内与场景同套 letterbox（避免紧凑 % 定位相对场景错位）。
   * Studio 程序预览勿 ui.show，以免顶掉当前容器导致场景消失。
   */
  useEffect(() => {
    hudWantedRef.current = isPlayerRuntime && autoShowHud;
    if (!isPlayerRuntime || !autoShowHud) {
      return;
    }

    const stop = startAutoHudSession(ctx, () => hudWantedRef.current);
    return () => {
      hudWantedRef.current = false;
      stop();
    };
  }, [ctx, isPlayerRuntime, autoShowHud]);

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
    setMethodOpenSceneTarget(null);
    setReturnButtonVisibleOverride(null);
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
        if (!isPlayerRuntime && autoShowHud) {
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
  }, [isPlayerModal, isPlayerRuntime, autoShowHud]);

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
            key={`player-${forcedOpenSceneId || "default"}-${forcedOpenNonce || 0}`}
            save={effectiveSave}
            openSceneId={
              forcedOpenSceneId.length > 0 ? forcedOpenSceneId : undefined
            }
            openNonce={forcedOpenNonce > 0 ? forcedOpenNonce : undefined}
            showReturnButton={returnButtonOverride}
            onRequestClose={handlePlayerRequestClose}
          />
        ) : RuntimeShellComp ? (
          <RuntimeShellComp
            key={`runtime-${forcedOpenSceneId || "default"}-${forcedOpenNonce || 0}`}
            save={effectiveSave}
            openSceneId={
              forcedOpenSceneId.length > 0 ? forcedOpenSceneId : undefined
            }
            openNonce={forcedOpenNonce > 0 ? forcedOpenNonce : undefined}
            showReturnButton={returnButtonOverride}
            onContinueStory={handlePlayerRequestClose}
          />
        ) : null}

        {!isPlayerRuntime && autoShowHud && HudShellComp && !hudCovered ? (
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
  const {
    save,
    playerPresentation,
    playerSession,
    openSceneId,
    openNonce,
    showReturnButton,
  } = props;

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
      openSceneId={openSceneId}
      openNonce={openNonce}
      showReturnButton={showReturnButton}
    />
  );
}
