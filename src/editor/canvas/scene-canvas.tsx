/**
 * scene-canvas.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 编辑器中部场景画布：DOM 底图 + hotspot overlay（设计分辨率 letterbox）。
 * 0.2.0：透明铺底；不再跟随场景 letterbox 色；仅保留编辑器描边 chrome。
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
import { clamp01 } from "../../shared/coords";
import { resolveAssetUrl } from "../../shared/resolve-asset-url";
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
   * 边框拉伸 hotspot（写回中心坐标 + visual 宽高）。
   *
   * @param id - hotspot id
   * @param geometry - 中心归一化 + 设计像素尺寸
   */
  onHotspotResize: (
    id: string,
    geometry: { x: number; y: number; width: number; height: number },
  ) => void;

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
  onHotspotResize,
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
  const onMoveRef = useRef(onHotspotMove);
  const placementActiveRef = useRef(placementActive);
  const sceneRef = useRef(scene);
  const selectedHotspotIdRef = useRef(selectedHotspotId);

  const [hostSize, setHostSize] = useState({ width: 800, height: 600 });
  const [imageNatural, setImageNatural] = useState({ width: 0, height: 0 });
  const [worldEl, setWorldEl] = useState<HTMLElement | null>(null);

  onSelectRef.current = onSelectHotspot;
  onPlaceRef.current = onCanvasPlace;
  onMoveRef.current = onHotspotMove;
  placementActiveRef.current = placementActive;
  sceneRef.current = scene;
  selectedHotspotIdRef.current = selectedHotspotId;

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

  /**
   * 方向键微调选中交互点：相对 contentRect 移动 1 设计像素（Shift 为 10）。
   * 在 INPUT / TEXTAREA / SELECT / contentEditable 内不拦截。
   */
  useEffect(() => {
    /**
     * @param event - 键盘事件
     */
    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key;

      if (
        key !== "ArrowUp" &&
        key !== "ArrowDown" &&
        key !== "ArrowLeft" &&
        key !== "ArrowRight"
      ) {
        return;
      }

      const hotspotId = selectedHotspotIdRef.current;
      const currentScene = sceneRef.current;

      if (hotspotId === null || currentScene === null) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;

      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true
      ) {
        return;
      }

      const hs = currentScene.hotspots.find((h) => h.id === hotspotId);

      if (hs === undefined) {
        return;
      }

      event.preventDefault();

      const stepPx = event.shiftKey ? 10 : 1;
      const rect = layoutRef.current.contentRect;
      const dxNorm =
        (key === "ArrowLeft" ? -stepPx : key === "ArrowRight" ? stepPx : 0) /
        Math.max(1e-6, rect.width);
      const dyNorm =
        (key === "ArrowUp" ? -stepPx : key === "ArrowDown" ? stepPx : 0) /
        Math.max(1e-6, rect.height);

      onMoveRef.current(
        hotspotId,
        clamp01(hs.x + dxNorm),
        clamp01(hs.y + dyNorm),
      );
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  /**
   * 测量宿主尺寸。
   *
   * 注意：外层 host 节点必须始终挂载（含空态），否则 ResizeObserver 在
   * `scene === null` 首帧挂不上，后续选中场景后仍停留在初始 800×600，
   * 设计画幅会看起来贴在中栏左上角而非居中。
   *
   * @returns 清理函数（断开观察）
   */
  useEffect(() => {
    const host = rootRef.current;

    if (host === null) {
      return;
    }

    /**
     * 将测量结果写回 state（忽略 0 尺寸，避免布局未完成时把 scale 打崩）。
     *
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

  return (
    <div
      ref={rootRef}
      data-testid="scene-canvas"
      style={{
        // 铺满中栏 host（父级需 position:relative + 明确高度）
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "transparent",
        cursor:
          scene !== null && placementActive ? "crosshair" : "default",
      }}
    >
      {scene === null ? null : (
        <SceneBaseLayer
          layout={layout}
          imageUrl={imageUrl}
          frameBackground="transparent"
          editorChrome
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
            onResize={onHotspotResize}
            resolveUrl={resolveUrl}
            worldElement={worldEl}
          />
        </SceneBaseLayer>
      )}
    </div>
  );
}
