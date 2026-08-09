/**
 * scene-view.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.1
 *
 * 运行时场景视图：底图 + 可见交互点 + toast 层（设计分辨率 letterbox）。
 * 0.1.1：空态与有场景共用同一 host，避免尺寸观测失效导致画面贴边。
 * 0.2.0：切换场景分层过渡——离开：交互点 → 底图；进入：底图 → 交互点。
 * 0.2.1：letterbox 解析改用 domain/letterbox.resolveLetterboxColor（支持透明）。
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import { resolveLetterboxColor } from "../domain/letterbox";
import { isHotspotVisible } from "../domain/progress";
import type {
  HotspotElement,
  HotspotHoverShadow,
  SceneDefinition,
  SceneProgress,
} from "../domain/types";
import type { ToastQueueState } from "../domain/toast-queue";
import { SceneBaseLayer } from "../editor/canvas/scene-base-layer";
import { resolveAssetUrl } from "../shared/resolve-asset-url";
import { buildSceneLayout } from "../shared/scene-layout";
import { useTheme } from "../theme/theme-provider";
import { HotspotView } from "./hotspot-view";
import { ToastLayer } from "./toast-layer";

/** 交互点淡入/淡出时长（毫秒）— 方案 A */
const HOTSPOT_FADE_MS = 150;

/** 底图淡入/淡出时长（毫秒）— 方案 A */
const BASE_FADE_MS = 200;

/**
 * SceneView 组件属性。
 */
export interface SceneViewProps {
  /** 当前场景定义；null 显示空态 */
  scene: SceneDefinition | null;

  /** 场景进度（consumed / visibility） */
  progress: SceneProgress;

  /** 设计分辨率宽 */
  designWidth: number;

  /** 设计分辨率高 */
  designHeight: number;

  /** toast 队列 */
  toastQueue: ToastQueueState;

  /**
   * 推进 toast 队列。
   */
  onToastAdvance: () => void;

  /**
   * 交互点被成功点击（alpha-hit 通过）后回调。
   *
   * @param hotspot - 被激活的交互点
   */
  onHotspotActivate: (hotspot: HotspotElement) => void;

  /**
   * toast 文案解析（空 text 回退物品名等）。
   *
   * @param toast - 当前 toast
   * @returns 展示文案
   */
  resolveToastText?: (toast: {
    text: string;
    anchorHotspotId: string;
  }) => string;

  /**
   * 全局交互点悬停预设（来自 `SceneUiConfig.hotspotHover`）。
   *
   * 由各 shell 读取并下传；HotspotView 据此与本地 hoverShadow 解析
   * 出运行时实际使用的悬停阴影（useGlobal !== false 时跟随全局）。
   */
  globalHoverShadow?: HotspotHoverShadow;
}

/**
 * 可取消的延时。
 *
 * @param ms - 毫秒
 * @param isCancelled - 返回 true 时提前结束（不抛错）
 * @returns Promise&lt;void&gt;
 */
function waitMs(
  ms: number,
  isCancelled: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const id = window.setTimeout(() => {
      resolve();
    }, ms);

    if (isCancelled()) {
      window.clearTimeout(id);
      resolve();
    }
  });
}

/**
 * 比较两个场景是否视为「同一展示目标」（仅比 id；皆 null 视为相同）。
 *
 * @param a - 场景 A
 * @param b - 场景 B
 * @returns 是否同一 id
 */
function sameSceneId(
  a: SceneDefinition | null,
  b: SceneDefinition | null,
): boolean {
  if (a === null && b === null) {
    return true;
  }

  if (a === null || b === null) {
    return false;
  }

  return a.id === b.id;
}

/**
 * 运行时场景视图：渲染底图、可见 hotspot、toast；切换时分层淡入淡出。
 *
 * 离开：交互点 150ms → 底图 200ms；进入：底图 200ms → 交互点 150ms。
 *
 * @param props - SceneViewProps
 * @returns 场景舞台
 *
 * @example
 * ```tsx
 * <SceneView
 *   scene={scene}
 *   progress={progress}
 *   designWidth={1920}
 *   designHeight={1080}
 *   toastQueue={queue}
 *   onToastAdvance={advance}
 *   onHotspotActivate={handleClick}
 * />
 * ```
 */
export function SceneView({
  scene,
  progress,
  designWidth,
  designHeight,
  toastQueue,
  onToastAdvance,
  onHotspotActivate,
  resolveToastText,
  globalHoverShadow,
}: SceneViewProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const rootRef = useRef<HTMLDivElement>(null);
  const [hostSize, setHostSize] = useState({ width: 800, height: 600 });
  const [imageNatural, setImageNatural] = useState({ width: 0, height: 0 });

  /**
   * 当前实际绘制的场景（过渡中仍为旧场景，直到淡出完成再切换）。
   */
  const [displayScene, setDisplayScene] = useState<SceneDefinition | null>(
    scene,
  );

  const [baseOpacity, setBaseOpacity] = useState(1);
  const [hotspotOpacity, setHotspotOpacity] = useState(1);

  /** 过渡中禁止点击交互点 */
  const [transitioning, setTransitioning] = useState(false);

  const bootstrappedRef = useRef(false);
  const displaySceneRef = useRef(displayScene);

  displaySceneRef.current = displayScene;

  const imageUrl = useMemo(() => {
    const raw = displayScene?.baseImage ?? "";

    return resolveAssetUrl(raw, ctx.asset?.resolve?.bind(ctx.asset));
  }, [displayScene?.baseImage, ctx.asset]);

  /**
   * @param uri - 资源 URI
   * @returns 可加载 URL
   */
  const resolveUrl = useCallback(
    (uri: string): string =>
      resolveAssetUrl(uri, ctx.asset?.resolve?.bind(ctx.asset)),
    [ctx.asset],
  );

  useEffect(() => {
    setImageNatural({ width: 0, height: 0 });
  }, [imageUrl]);

  const layout = useMemo(
    () =>
      buildSceneLayout(
        hostSize.width,
        hostSize.height,
        designWidth,
        designHeight,
        imageNatural.width,
        imageNatural.height,
        1,
      ),
    [
      hostSize.width,
      hostSize.height,
      designWidth,
      designHeight,
      imageNatural.width,
      imageNatural.height,
    ],
  );

  /**
   * 测量运行时宿主尺寸。
   *
   * @returns 清理函数
   */
  useEffect(() => {
    const host = rootRef.current;

    if (host === null) {
      return;
    }

    /**
     * @param width - 宿主宽
     * @param height - 宿主高
     */
    const applySize = (width: number, height: number): void => {
      const w = width > 1 ? width : 0;
      const h = height > 1 ? height : 0;

      if (w <= 0 || h <= 0) {
        return;
      }

      setHostSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h },
      );
    };

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry === undefined) {
        return;
      }

      const { width, height } = entry.contentRect;

      applySize(width, height);
    });

    ro.observe(host);
    const rect = host.getBoundingClientRect();

    applySize(rect.width, rect.height);

    return () => ro.disconnect();
  }, []);

  /**
   * 场景 id 变化时跑分层过渡；首次挂载直接显示、不淡出。
   */
  useEffect(() => {
    const from = displaySceneRef.current;
    const to = scene;

    // 首次 effect：仅标记已引导；初始 useState 已用 scene，无需再播过渡
    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;

      if (sameSceneId(from, to)) {
        if (to !== null) {
          setDisplayScene(to);
        }

        return;
      }

      // 极端：首帧 props 已与 initial state 不同，仍走完整过渡
    }

    if (sameSceneId(from, to)) {
      // 同 id 时同步最新定义（热更新属性），不打断过渡
      if (to !== null) {
        setDisplayScene(to);
      }

      return;
    }

    let cancelled = false;

    /**
     * @returns 是否已取消
     */
    const isCancelled = (): boolean => cancelled;

    setTransitioning(true);

    void (async () => {
      // —— 离开：交互点先消失 ——
      if (from !== null) {
        setHotspotOpacity(0);
        await waitMs(HOTSPOT_FADE_MS, isCancelled);

        if (cancelled) {
          return;
        }

        // —— 离开：底图再消失 ——
        setBaseOpacity(0);
        await waitMs(BASE_FADE_MS, isCancelled);

        if (cancelled) {
          return;
        }
      }

      // —— 切换绘制目标 ——
      setDisplayScene(to);
      setHotspotOpacity(0);
      setBaseOpacity(0);

      // 等一帧让底图 URL / 布局落地
      await waitMs(16, isCancelled);

      if (cancelled) {
        return;
      }

      if (to === null) {
        setTransitioning(false);

        return;
      }

      // —— 进入：底图先出现 ——
      setBaseOpacity(1);
      await waitMs(BASE_FADE_MS, isCancelled);

      if (cancelled) {
        return;
      }

      // —— 进入：交互点再出现 ——
      setHotspotOpacity(1);
      await waitMs(HOTSPOT_FADE_MS, isCancelled);

      if (cancelled) {
        return;
      }

      setTransitioning(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [scene === null ? null : scene.id]);

  const visibleHotspots = useMemo(() => {
    if (displayScene === null) {
      return [];
    }

    return displayScene.hotspots.filter((hs) =>
      isHotspotVisible(hs, progress),
    );
  }, [displayScene, progress]);

  const letterbox =
    displayScene !== null
      ? resolveLetterboxColor(displayScene)
      : tokens.bgSunken;

  return (
    <div
      ref={rootRef}
      data-testid="runtime-scene-view"
      data-scene-transitioning={transitioning ? "true" : "false"}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: letterbox,
      }}
    >
      {displayScene === null ? (
        <div
          data-testid="runtime-scene-view-empty"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: tokens.textMuted,
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          暂无场景，请先在编辑器中创建
        </div>
      ) : (
        <SceneBaseLayer
          layout={layout}
          imageUrl={imageUrl}
          frameBackground={letterbox}
          baseImageOpacity={baseOpacity}
          baseImageTransitionMs={BASE_FADE_MS}
          onImageNaturalSize={(w, h) => {
            setImageNatural({ width: w, height: h });
          }}
          onImageError={() => {
            setImageNatural({ width: 0, height: 0 });
          }}
        >
          <div
            data-testid="runtime-hotspot-layer"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              opacity: hotspotOpacity,
              transition: `opacity ${HOTSPOT_FADE_MS}ms ease`,
            }}
          >
            {visibleHotspots.map((hs) => (
              <HotspotView
                key={hs.id}
                hotspot={hs}
                contentRect={layout.contentRect}
                resolveUrl={resolveUrl}
                onActivate={
                  transitioning || hotspotOpacity < 0.99
                    ? () => {
                        /* 过渡中忽略点击 */
                      }
                    : onHotspotActivate
                }
                globalHoverShadow={globalHoverShadow}
              />
            ))}
          </div>

          <ToastLayer
            queue={toastQueue}
            onAdvance={onToastAdvance}
            hotspots={displayScene.hotspots}
            contentRect={layout.contentRect}
            resolveText={resolveToastText}
          />
        </SceneBaseLayer>
      )}
    </div>
  );
}
