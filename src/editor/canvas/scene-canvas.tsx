/**
 * scene-canvas.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 编辑器中部场景画布：DOM 底图 + hotspot overlay（设计分辨率 letterbox）。
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import type { SceneDefinition } from "../../domain/types";
import { buildSceneLayout, worldToNorm } from "../../shared/scene-layout";
import { HotspotLayer } from "./hotspot-layer";
import { SceneBaseLayer } from "./scene-base-layer";

/**
 * SceneCanvas 组件属性。
 */
export interface SceneCanvasProps {
  /** 当前场景；无场景时显示空态 */
  scene: SceneDefinition | null;

  /** 选中的 hotspot id */
  selectedHotspotId: string | null;

  /**
   * 选中 hotspot。
   *
   * @param id - hotspot id；取消选中传 null
   */
  onSelectHotspot: (id: string | null) => void;

  /**
   * 拖拽移动 hotspot（写回归一化 x/y）。
   *
   * @param id - hotspot id
   * @param x - 归一化 X
   * @param y - 归一化 Y
   */
  onHotspotMove: (id: string, x: number, y: number) => void;

  /**
   * 点击空白放置新 hotspot（放置模式开启时）。
   *
   * @param x - 归一化 X
   * @param y - 归一化 Y
   */
  onCanvasPlace?: (x: number, y: number) => void;

  /** 是否处于点击放置模式 */
  placementActive?: boolean;

  /** 设计分辨率宽 */
  designWidth: number;

  /** 设计分辨率高 */
  designHeight: number;
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
 * 编辑器中部场景画布。
 *
 * @param props - SceneCanvasProps
 * @returns 画布容器
 *
 * @example
 * ```tsx
 * <SceneCanvas
 *   scene={scene}
 *   selectedHotspotId={hsId}
 *   onSelectHotspot={setHsId}
 *   onHotspotMove={handleMove}
 *   designWidth={1920}
 *   designHeight={1080}
 * />
 * ```
 */
export function SceneCanvas({
  scene,
  selectedHotspotId,
  onSelectHotspot,
  onHotspotMove,
  onCanvasPlace,
  placementActive = false,
  designWidth,
  designHeight,
}: SceneCanvasProps): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const worldElRef = useRef<HTMLElement | null>(null);
  const layoutRef = useRef(
    buildSceneLayout(800, 600, designWidth, designHeight, 0, 0),
  );
  const onSelectRef = useRef(onSelectHotspot);
  const onPlaceRef = useRef(onCanvasPlace);
  const placementActiveRef = useRef(placementActive);

  const [hostSize, setHostSize] = useState({ width: 800, height: 600 });
  const [imageNatural, setImageNatural] = useState({ width: 0, height: 0 });
  const [worldEl, setWorldEl] = useState<HTMLElement | null>(null);

  onSelectRef.current = onSelectHotspot;
  onPlaceRef.current = onCanvasPlace;
  placementActiveRef.current = placementActive;

  const ctx = useExtensionContext();

  const imageUrl = useMemo(() => {
    const raw = scene?.baseImage ?? "";

    return resolveAssetUrl(raw, ctx.asset?.resolve?.bind(ctx.asset));
  }, [scene?.baseImage, ctx.asset]);

  /**
   * 解析任意资源 URI。
   *
   * @param uri - 领域 URI
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

  layoutRef.current = layout;

  useEffect(() => {
    const host = rootRef.current;

    if (host === null) {
      return;
    }

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry === undefined) {
        return;
      }

      const { width, height } = entry.contentRect;

      setHostSize({
        width: Math.max(1, width),
        height: Math.max(1, height),
      });
    });

    ro.observe(host);
    const rect = host.getBoundingClientRect();

    setHostSize({
      width: Math.max(1, rect.width || 800),
      height: Math.max(1, rect.height || 600),
    });

    return () => ro.disconnect();
  }, []);

  // 同步 world DOM 引用（供 HotspotLayer 坐标换算）
  useEffect(() => {
    const host = rootRef.current;

    if (host === null) {
      return;
    }

    const el = host.querySelector(
      '[data-testid="scene-base-world"]',
    ) as HTMLElement | null;

    worldElRef.current = el;
    setWorldEl(el);
  }, [layout, scene?.id]);

  /**
   * 空白点击：放置或取消选中。
   *
   * @param designX - 设计像素 X
   * @param designY - 设计像素 Y
   */
  const handleBlankPointerDown = useCallback(
    (designX: number, designY: number): void => {
      const L = layoutRef.current;
      const norm = worldToNorm(designX, designY, L.contentRect);

      if (placementActiveRef.current) {
        onPlaceRef.current?.(norm.x, norm.y);

        return;
      }

      onSelectRef.current(null);
    },
    [],
  );

  if (scene === null) {
    return (
      <div
        data-testid="scene-canvas"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#141418",
          color: "rgba(200,200,210,0.55)",
          fontSize: 13,
        }}
      >
        请选择或新建场景
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-testid="scene-canvas"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#141418",
        cursor: placementActive ? "crosshair" : "default",
      }}
    >
      <SceneBaseLayer
        layout={layout}
        imageUrl={imageUrl}
        onImageNaturalSize={(w, h) => {
          setImageNatural({ width: w, height: h });
        }}
        onImageError={() => {
          setImageNatural({ width: 0, height: 0 });
        }}
        onBlankPointerDown={handleBlankPointerDown}
      >
        <HotspotLayer
          hotspots={scene.hotspots}
          contentRect={layout.contentRect}
          selectedId={selectedHotspotId}
          onSelect={(id) => onSelectRef.current(id)}
          onMove={onHotspotMove}
          resolveUrl={resolveUrl}
          worldElement={worldEl}
        />
      </SceneBaseLayer>
    </div>
  );
}
