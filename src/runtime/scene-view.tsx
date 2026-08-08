/**
 * scene-view.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 运行时场景视图：底图 + 可见交互点 + toast 层（设计分辨率 letterbox）。
 * 0.1.1：空态与有场景共用同一 host，避免尺寸观测失效导致画面贴边。
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
import type {
  HotspotElement,
  SceneDefinition,
  SceneProgress,
} from "../domain/types";
import type { ToastQueueState } from "../domain/toast-queue";
import { SceneBaseLayer } from "../editor/canvas/scene-base-layer";
import { buildSceneLayout } from "../shared/scene-layout";
import { useTheme } from "../theme/theme-provider";
import { HotspotView } from "./hotspot-view";
import { ToastLayer } from "./toast-layer";

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
}

/**
 * 解析资源 URI 为可加载 URL。
 *
 * @param uri - 领域 URI / 绝对 URL
 * @param resolve - SDK asset.resolve
 * @returns 可加载 URL；空输入返回空串
 */
function resolveAssetUrl(
  uri: string,
  resolve: ((uri: string) => { url: string }) | undefined,
): string {
  if (!uri) {
    return "";
  }

  if (
    uri.startsWith("http://") ||
    uri.startsWith("https://") ||
    uri.startsWith("blob:") ||
    uri.startsWith("data:")
  ) {
    return uri;
  }

  if (resolve === undefined) {
    return uri;
  }

  try {
    return resolve(uri).url || uri;
  } catch {
    return uri;
  }
}

/**
 * 根据 letterbox 字段解析画幅底色。
 *
 * @param scene - 场景定义
 * @returns CSS 颜色
 */
function resolveLetterboxColor(scene: SceneDefinition): string {
  const mode = scene.letterboxMode ?? "black";

  if (mode === "white") {
    return "#FFFFFF";
  }

  if (mode === "custom" && scene.letterboxColor) {
    return scene.letterboxColor;
  }

  return "#141418";
}

/**
 * 运行时场景视图：渲染底图、可见 hotspot、toast。
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
}: SceneViewProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const rootRef = useRef<HTMLDivElement>(null);
  const [hostSize, setHostSize] = useState({ width: 800, height: 600 });
  const [imageNatural, setImageNatural] = useState({ width: 0, height: 0 });

  const imageUrl = useMemo(() => {
    const raw = scene?.baseImage ?? "";

    return resolveAssetUrl(raw, ctx.asset?.resolve?.bind(ctx.asset));
  }, [scene?.baseImage, ctx.asset]);

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
   * 外层 host 在空态/有场景时保持同一节点，避免 null→scene 切换后
   * ResizeObserver 仍挂在已卸载 DOM 上、letterbox 无法按真实视口居中。
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

  const visibleHotspots = useMemo(() => {
    if (scene === null) {
      return [];
    }

    return scene.hotspots.filter((hs) => isHotspotVisible(hs, progress));
  }, [scene, progress]);

  const letterbox =
    scene !== null ? resolveLetterboxColor(scene) : tokens.bgSunken;

  return (
    <div
      ref={rootRef}
      data-testid="runtime-scene-view"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: letterbox,
      }}
    >
      {scene === null ? (
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
            }}
          >
            {visibleHotspots.map((hs) => (
              <HotspotView
                key={hs.id}
                hotspot={hs}
                contentRect={layout.contentRect}
                resolveUrl={resolveUrl}
                onActivate={onHotspotActivate}
              />
            ))}
          </div>

          <ToastLayer
            queue={toastQueue}
            onAdvance={onToastAdvance}
            hotspots={scene.hotspots}
            contentRect={layout.contentRect}
            resolveText={resolveToastText}
          />
        </SceneBaseLayer>
      )}
    </div>
  );
}
