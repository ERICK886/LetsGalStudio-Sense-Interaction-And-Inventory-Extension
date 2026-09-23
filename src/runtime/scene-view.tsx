/**
 * scene-view.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.5.0
 *
 * 运行时场景视图：底图 + 可见交互点 + toast 层（透明铺底 + 设计分辨率 letterbox）。
 * 0.5.0：场景切换支持淡入淡出（同时溶换）与覆盖（新层叠上），由目标场景 transitionMode 决定。
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import { isHotspotVisible } from "../domain/progress";
import {
  coverEnterStartPose,
  DEFAULT_SCENE_TRANSITION_MS,
  hiddenSceneLayerPose,
  normalizeSceneTransitionMode,
  resolveSceneTransitionDelayMs,
  resolveSceneTransitionMs,
  restSceneLayerPose,
  type SceneLayerPose,
} from "../domain/scene-transition";
import type {
  HotspotElement,
  HotspotHoverShadow,
  HotspotLabelStyleConfig,
  SceneDefinition,
  SceneProgress,
} from "../domain/types";
import type { ToastQueueState } from "../domain/toast-queue";
import { SceneBaseLayer } from "../shared/scene-base-layer";
import { resolveAssetUrl } from "../shared/resolve-asset-url";
import { buildSceneLayout } from "../shared/scene-layout";
import { HotspotView } from "./hotspot-view";
import { ToastLayer } from "./toast-layer";

/** 层位姿 CSS 缓动 */
const POSE_EASING = "cubic-bezier(0.45, 0.05, 0.15, 1)";

/**
 * 单层可绘制场景（含已解析的底图尺寸，避免换图时 layout 归零闪一下）。
 */
interface PaintedScene {
  scene: SceneDefinition;
  natural: { width: number; height: number };
}

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

  /**
   * 全局交互点提示文本外观（来自 `SceneUiConfig.hotspotLabel`）。
   */
  globalHotspotLabel?: HotspotLabelStyleConfig;
}

/**
 * 可取消的延时；取消时尽快结束 await。
 *
 * @param ms - 毫秒
 * @param isCancelled - 返回 true 时提前结束（不抛错）
 * @returns Promise&lt;void&gt;
 */
function waitMs(
  ms: number,
  isCancelled: () => boolean,
): Promise<void> {
  if (ms <= 0 || isCancelled()) {
    return Promise.resolve();
  }

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
 * 等两帧，确保双层 DOM / 缓存图已提交到屏幕再开过渡。
 *
 * @param isCancelled - 取消检测
 * @returns Promise&lt;void&gt;
 */
async function waitPaint(isCancelled: () => boolean): Promise<void> {
  if (isCancelled()) {
    return;
  }

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

/**
 * 起始位姿落地后再开 CSS transition：强制 reflow + 再等一帧。
 *
 * @param host - 场景宿主（用于 offsetHeight reflow）
 * @param isCancelled - 取消检测
 */
async function waitPoseCommit(
  host: HTMLElement | null,
  isCancelled: () => boolean,
): Promise<void> {
  await waitPaint(isCancelled);

  if (isCancelled()) {
    return;
  }

  if (host !== null) {
    void host.offsetHeight;
  }

  await waitPaint(isCancelled);
}

/**
 * 预加载单张图并尽量 decode；失败或空 URL 返回 0×0。
 *
 * @param url - 已 resolve 的图片 URL
 * @returns 自然宽高
 */
function preloadSceneImage(
  url: string,
): Promise<{ width: number; height: number }> {
  if (!url) {
    return Promise.resolve({ width: 0, height: 0 });
  }

  return new Promise((resolve) => {
    let settled = false;

    /**
     * @param width - naturalWidth
     * @param height - naturalHeight
     */
    const done = (width: number, height: number): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({ width, height });
    };

    const img = new Image();

    /**
     * 加载完成后尽量 decode，减少首帧溶入时的解码卡顿。
     */
    const finish = (): void => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;

      if (typeof img.decode === "function") {
        void img
          .decode()
          .catch(() => undefined)
          .finally(() => {
            done(w, h);
          });

        return;
      }

      done(w, h);
    };

    img.onload = () => {
      finish();
    };
    img.onerror = () => {
      done(0, 0);
    };
    img.src = url;

    if (img.complete && img.naturalWidth > 0) {
      finish();
    } else if (img.complete) {
      done(0, 0);
    }
  });
}

/**
 * 预加载场景底图 + 可见交互点图，再开交叉淡入淡出。
 *
 * @param scene - 目标场景
 * @param resolveUrl - URI → URL
 * @returns 底图 natural 尺寸
 */
async function preloadSceneBundle(
  scene: SceneDefinition,
  resolveUrl: (uri: string) => string,
): Promise<{ width: number; height: number }> {
  const baseUrl = resolveUrl(scene.baseImage ?? "");
  const baseNatural = await preloadSceneImage(baseUrl);

  const hotspotUrls = scene.hotspots
    .map((hs) => resolveUrl(hs.visual?.src ?? ""))
    .filter((u) => u.length > 0);

  if (hotspotUrls.length > 0) {
    await Promise.all(hotspotUrls.map((u) => preloadSceneImage(u)));
  }

  return baseNatural;
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
 * 运行时场景视图：渲染底图、可见 hotspot、toast；切换时交叉淡入淡出。
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
  globalHotspotLabel,
}: SceneViewProps): React.ReactElement {
  const ctx = useExtensionContext();
  const [, setVariableRevision] = useState(0);
  useEffect(
    () => ctx.subscribe("variable:changed", () =>
      setVariableRevision((revision) => revision + 1),
    ),
    [ctx],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  /**
   * 宿主实测尺寸；未测到前不布局/不播转场，避免默认 800×600 → 真尺寸时
   * world.scale 跳变被看成交互点「从小放大」。
   */
  const [hostSize, setHostSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  /**
   * 当前层（上层）：交叉淡入的目标 / 稳态展示。
   * 初始为 null，首帧经预加载后再挂载，避免未解码底图闪一下。
   */
  const [current, setCurrent] = useState<PaintedScene | null>(null);

  /** 离开层（下层）：转场中的旧场景 */
  const [outgoing, setOutgoing] = useState<PaintedScene | null>(null);

  const [currentPose, setCurrentPose] = useState<SceneLayerPose>(() =>
    hiddenSceneLayerPose(),
  );
  const [outgoingPose, setOutgoingPose] = useState<SceneLayerPose>(() =>
    restSceneLayerPose(),
  );
  /** 当前转场动画时长（写入 CSS transition） */
  const [poseTransitionMs, setPoseTransitionMs] = useState(0);

  /** 过渡中禁止点击交互点 */
  const [transitioning, setTransitioning] = useState(false);

  const bootstrappedRef = useRef(false);
  const currentRef = useRef(current);

  currentRef.current = current;

  /**
   * @param uri - 资源 URI
   * @returns 可加载 URL
   */
  const resolveUrl = useCallback(
    (uri: string): string =>
      resolveAssetUrl(uri, ctx.asset?.resolve?.bind(ctx.asset)),
    [ctx.asset],
  );

  /**
   * @param painted - 待绘制场景
   * @returns 底图 URL
   */
  const sceneImageUrl = useCallback(
    (painted: PaintedScene): string =>
      resolveAssetUrl(
        painted.scene.baseImage ?? "",
        ctx.asset?.resolve?.bind(ctx.asset),
      ),
    [ctx.asset],
  );

  /**
   * @param painted - 待绘制场景
   * @returns 布局快照
   */
  const layoutFor = useCallback(
    (painted: PaintedScene) => {
      const hw = hostSize?.width ?? 0;
      const hh = hostSize?.height ?? 0;

      return buildSceneLayout(
        hw > 0 ? hw : 1,
        hh > 0 ? hh : 1,
        designWidth,
        designHeight,
        painted.natural.width,
        painted.natural.height,
        1,
      );
    },
    [hostSize, designWidth, designHeight],
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
        prev !== null && prev.width === w && prev.height === h
          ? prev
          : { width: w, height: h },
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
    // 首帧布局未完成时再补测一次
    const raf = window.requestAnimationFrame(() => {
      const r = host.getBoundingClientRect();

      applySize(r.width, r.height);
    });

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const transitionGenRef = useRef(0);

  /**
   * 场景 id 变化：预加载后整层交叉淡入淡出。
   * 宿主未测到前不开始；取消时用 generation 避免旧异步把新转场打回透明。
   */
  useEffect(() => {
    if (hostSize === null) {
      return;
    }

    const gen = ++transitionGenRef.current;
    const isCancelled = (): boolean => gen !== transitionGenRef.current;

    const from = currentRef.current?.scene ?? null;
    const to = scene;
    const fromPainted = currentRef.current;

    /**
     * 保证当前层可见（修复取消竞态卡在全透明 →「场景没了」）。
     */
    const ensureVisible = (): void => {
      if (isCancelled()) {
        return;
      }

      setPoseTransitionMs(0);
      setCurrentPose(restSceneLayerPose());
      setOutgoing(null);
      setOutgoingPose(restSceneLayerPose());
      setTransitioning(false);
    };

    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;

      setTransitioning(true);
      setPoseTransitionMs(0);
      setCurrentPose(hiddenSceneLayerPose());
      setOutgoing(null);

      void (async () => {
        if (to === null) {
          if (!isCancelled()) {
            setCurrent(null);
            setTransitioning(false);
          }

          return;
        }

        const natural = await preloadSceneBundle(to, resolveUrl);
        const dur = resolveSceneTransitionMs(to);
        const delay = resolveSceneTransitionDelayMs(to);

        if (isCancelled()) {
          return;
        }

        setCurrent({ scene: to, natural });
        setCurrentPose(hiddenSceneLayerPose());
        await waitPaint(isCancelled);

        if (isCancelled()) {
          return;
        }

        if (delay > 0) {
          await waitMs(delay, isCancelled);
        }

        if (isCancelled()) {
          return;
        }

        setPoseTransitionMs(dur);
        setCurrentPose(restSceneLayerPose());
        await waitMs(dur, isCancelled);
        ensureVisible();
      })();

      return;
    }

    if (sameSceneId(from, to)) {
      if (to !== null) {
        setCurrent((prev) =>
          prev === null
            ? { scene: to, natural: { width: 0, height: 0 } }
            : { ...prev, scene: to },
        );
      }

      ensureVisible();

      return;
    }

    setTransitioning(true);

    void (async () => {
      if (to === null) {
        const dur = fromPainted
          ? resolveSceneTransitionMs(fromPainted.scene)
          : DEFAULT_SCENE_TRANSITION_MS;

        setPoseTransitionMs(dur);
        setCurrentPose(hiddenSceneLayerPose());
        await waitMs(dur, isCancelled);

        if (isCancelled()) {
          return;
        }

        setCurrent(null);
        setOutgoing(null);
        setTransitioning(false);

        return;
      }

      const mode = normalizeSceneTransitionMode(to.transitionMode);
      const dur = resolveSceneTransitionMs(to);
      const delay = resolveSceneTransitionDelayMs(to);
      const nextNatural = await preloadSceneBundle(to, resolveUrl);

      if (isCancelled()) {
        return;
      }

      if (fromPainted === null) {
        setCurrent({ scene: to, natural: nextNatural });
        setPoseTransitionMs(0);
        setCurrentPose(hiddenSceneLayerPose());
        setOutgoing(null);
        await waitPaint(isCancelled);

        if (isCancelled()) {
          return;
        }

        if (delay > 0) {
          await waitMs(delay, isCancelled);
        }

        if (isCancelled()) {
          return;
        }

        setPoseTransitionMs(dur);
        setCurrentPose(restSceneLayerPose());
        await waitMs(dur, isCancelled);
        ensureVisible();

        return;
      }

      // —— 挂好双层：旧层全显，新层按模式就位（transition=0，避免起始位姿被插值闪一下） ——
      setPoseTransitionMs(0);
      setOutgoing(fromPainted);
      setOutgoingPose(restSceneLayerPose());
      setCurrent({ scene: to, natural: nextNatural });

      if (mode === "cover") {
        setCurrentPose(coverEnterStartPose(to.motion?.enter?.preset));
      } else {
        setCurrentPose(hiddenSceneLayerPose());
      }

      await waitPoseCommit(rootRef.current, isCancelled);

      if (isCancelled()) {
        return;
      }

      if (delay > 0) {
        await waitMs(delay, isCancelled);
      }

      if (isCancelled()) {
        return;
      }

      setPoseTransitionMs(dur);

      if (mode === "fade") {
        // 淡入淡出=同时溶换，避免「旧已淡出、新未淡入」中间露透明底闪一下
        setOutgoingPose(hiddenSceneLayerPose());
        setCurrentPose(restSceneLayerPose());
        await waitMs(dur, isCancelled);
      } else {
        // 覆盖：旧场景保持全显，新场景叠上覆入
        setCurrentPose(restSceneLayerPose());
        await waitMs(dur, isCancelled);
      }

      if (isCancelled()) {
        return;
      }

      setOutgoing(null);
      ensureVisible();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scene.id + hostReady
  }, [scene === null ? null : scene.id, hostSize === null ? null : "ready"]);

  /**
   * @param painted - 层所属场景
   * @returns 该层应绘制的可见交互点
   */
  const hotspotsFor = useCallback(
    (painted: PaintedScene): HotspotElement[] =>
      painted.scene.hotspots.filter((hotspot) =>
        isHotspotVisible(hotspot, progress, (name) => ctx.variables.get(name)),
      ),
    [progress, ctx],
  );

  /**
   * @param painted - 层数据
   * @param pose - 外层位姿（opacity / 位移 / scale）
   * @param interactive - true=当前层（可点+toast）；false=离开层（只绘外观）
   * @returns 层 React 节点
   */
  const renderPaintedLayer = (
    painted: PaintedScene,
    pose: SceneLayerPose,
    interactive: boolean,
  ): React.ReactElement => {
    const layout = layoutFor(painted);
    const imageUrl = sceneImageUrl(painted);
    const layerHotspots = hotspotsFor(painted);
    const ms = poseTransitionMs;
    const transform = `translate(${pose.txPct}%, ${pose.tyPct}%) scale(${pose.scale})`;

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: pose.opacity,
          transform,
          transformOrigin: "center center",
          transition:
            ms > 0
              ? `opacity ${ms}ms ${POSE_EASING}, transform ${ms}ms ${POSE_EASING}`
              : undefined,
          pointerEvents: interactive && !transitioning ? "auto" : "none",
          willChange: transitioning ? "opacity, transform" : undefined,
        }}
      >
        <SceneBaseLayer
          layout={layout}
          imageUrl={imageUrl}
          frameBackground="transparent"
          editorChrome={false}
          baseImageOpacity={1}
          baseImageTransitionMs={0}
          layerOpacity={1}
          layerOpacityTransitionMs={0}
          onImageNaturalSize={(w, h) => {
            if (!interactive || transitioning) {
              return;
            }

            setCurrent((prev) => {
              if (prev === null || prev.scene.id !== painted.scene.id) {
                return prev;
              }

              if (prev.natural.width === w && prev.natural.height === h) {
                return prev;
              }

              return { ...prev, natural: { width: w, height: h } };
            });
          }}
        >
          <div
            data-testid={
              interactive
                ? "runtime-hotspot-layer"
                : "runtime-hotspot-layer-outgoing"
            }
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
            }}
          >
            {layerHotspots.map((hs) => (
              <HotspotView
                key={hs.id}
                hotspot={hs}
                contentRect={layout.contentRect}
                resolveUrl={resolveUrl}
                onActivate={
                  interactive && !transitioning
                    ? onHotspotActivate
                    : () => {
                        /* 离开层 / 转场中不可点 */
                      }
                }
                globalHoverShadow={globalHoverShadow}
                globalHotspotLabel={globalHotspotLabel}
                hoverEffectsEnabled={interactive && !transitioning}
              />
            ))}
          </div>

          {interactive ? (
            <ToastLayer
              queue={toastQueue}
              onAdvance={onToastAdvance}
              hotspots={painted.scene.hotspots}
              contentRect={layout.contentRect}
              resolveText={resolveToastText}
            />
          ) : null}
        </SceneBaseLayer>
      </div>
    );
  };

  /**
   * 按 scene.id 稳定 key 绘制层：旧场景从 current→outgoing 时复用 DOM，
   * 避免底图重挂载造成闪白。
   */
  const displayLayers = useMemo(() => {
    const layers: Array<{
      painted: PaintedScene;
      pose: SceneLayerPose;
      zIndex: number;
      interactive: boolean;
    }> = [];

    if (outgoing !== null) {
      layers.push({
        painted: outgoing,
        pose: outgoingPose,
        zIndex: 1,
        interactive: false,
      });
    }

    if (current !== null) {
      layers.push({
        painted: current,
        pose: currentPose,
        zIndex: 2,
        interactive: true,
      });
    }

    return layers;
  }, [current, currentPose, outgoing, outgoingPose]);

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
        background: "transparent",
      }}
    >
      {displayLayers.map((layer) => (
        <div
          key={layer.painted.scene.id}
          data-testid={
            layer.interactive
              ? "runtime-scene-layer-current"
              : "runtime-scene-layer-outgoing"
          }
          style={{
            position: "absolute",
            inset: 0,
            zIndex: layer.zIndex,
          }}
        >
          {renderPaintedLayer(
            layer.painted,
            layer.pose,
            layer.interactive,
          )}
        </div>
      ))}
    </div>
  );
}
