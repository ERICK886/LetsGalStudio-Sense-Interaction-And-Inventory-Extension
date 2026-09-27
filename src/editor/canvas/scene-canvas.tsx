import { Button, chakra } from "@chakra-ui/react";
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
import type { ImageNaturalSize } from "../../shared/hotspot-image-size";
import { resolveContextAssetUrl } from "../../shared/resolve-context-asset-url";
import { buildSceneLayout, contentRectForBase, worldToNorm, type ContentRect } from "../../shared/scene-layout";
import { HotspotLayer } from "./hotspot-layer";
import { SceneBaseLayer } from "../../shared/scene-base-layer";
import { useTheme } from "../../theme/theme-provider";
import { editorButtonProps } from "../ui/editor-control-styles";
import { applySceneViewport, bindSceneViewportGestures, FIT_SCENE_VIEWPORT, type SceneCanvasViewport } from "./scene-canvas-viewport";

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
   * 边框拉伸 hotspot（写回中心坐标 + 相对底图的宽高比例）。
   *
   * @param id - hotspot id
   * @param geometry - 中心归一化 + 设计像素尺寸
   */
  onHotspotResize: (
    id: string,
    geometry: { x: number; y: number; widthRatio: number; heightRatio: number },
  ) => void;

  /** 底图尺寸确定后，将旧像素尺寸迁移到内容区比例。 */
  onNormalizeHotspotSizes?: (sceneId: string, contentRect: ContentRect, imageSizes?: ReadonlyMap<string, ImageNaturalSize>) => void;

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
  onNormalizeHotspotSizes,
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
  const [viewport, setViewport] = useState<SceneCanvasViewport>(FIT_SCENE_VIEWPORT);
  const viewportRef = useRef(viewport);
  const [panning, setPanning] = useState(false);
  const { tokens } = useTheme();

  onSelectRef.current = onSelectHotspot;
  onPlaceRef.current = onCanvasPlace;
  onMoveRef.current = onHotspotMove;
  placementActiveRef.current = placementActive;
  sceneRef.current = scene;
  selectedHotspotIdRef.current = selectedHotspotId;

  const ctx = useExtensionContext();

  const imageUrl = useMemo(() => {
    const raw = scene?.baseImage ?? "";

    return resolveContextAssetUrl(ctx, raw);
  }, [scene?.baseImage, ctx]);

  /**
   * 解析任意资源 URI。
   *
   * @param uri - 领域 URI
   * @returns 可加载 URL
   */
  const resolveUrl = useCallback(
    (uri: string): string =>
      resolveContextAssetUrl(ctx, uri),
    [ctx],
  );

  useEffect(() => {
    setImageNatural({ width: 0, height: 0 });
  }, [imageUrl]);

  useEffect(() => {
    if (scene !== null && imageUrl === "") {
      onNormalizeHotspotSizes?.(scene.id, contentRectForBase(designWidth, designHeight, 0, 0));
    }
  }, [scene?.id, imageUrl, designWidth, designHeight, onNormalizeHotspotSizes]);

  const baseLayout = useMemo(
    () =>
      buildSceneLayout(
        hostSize.width,
        hostSize.height,
        designWidth,
        designHeight,
        imageNatural.width,
        imageNatural.height,
        undefined,
        scene?.baseImageFit,
      ),
    [
      hostSize.width,
      hostSize.height,
      designWidth,
      designHeight,
      imageNatural.width,
      imageNatural.height,
      scene?.baseImageFit,
    ],
  );

  const baseLayoutRef = useRef(baseLayout);
  baseLayoutRef.current = baseLayout;
  const layout = useMemo(() => applySceneViewport(baseLayout, viewport), [baseLayout, viewport]);
  viewportRef.current = viewport;

  const resetViewport = useCallback(() => {
    viewportRef.current = FIT_SCENE_VIEWPORT;
    setViewport(FIT_SCENE_VIEWPORT);
    setPanning(false);
  }, []);

  useEffect(() => {
    resetViewport();
  }, [scene?.id, designWidth, designHeight, resetViewport]);

  useEffect(() => {
    const host = rootRef.current;
    if (!host) return;
    return bindSceneViewportGestures(host, host.ownerDocument.defaultView ?? window, {
      getView: () => viewportRef.current,
      getLayout: () => baseLayoutRef.current,
      isEnabled: () => sceneRef.current !== null,
      onChange: (next) => { viewportRef.current = next; setViewport(next); },
      onPanning: setPanning,
    });
  }, [scene?.id, designWidth, designHeight]);

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
    // 宿主预览自身也可能有 CSS scale；测量布局尺寸而非屏幕尺寸。
    applySize(host.clientWidth, host.clientHeight);

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
    <chakra.div
      ref={rootRef}
      data-testid="scene-canvas"
      style={{
        // 铺满中栏 host（父级需 position:relative + 明确高度）
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "transparent",
        cursor: panning ? "grabbing" : scene !== null && placementActive ? "crosshair" : "default",
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
            onNormalizeHotspotSizes?.(
              scene.id,
              contentRectForBase(designWidth, designHeight, w, h, scene.baseImageFit),
            );
          }}
          onImageError={() => {
            setImageNatural({ width: 0, height: 0 });
          }}
          onBlankPointerDown={handleBlankPointerDown}
        >
          <HotspotLayer
            hotspots={scene.hotspots}
            onImageSizes={imageUrl === "" || imageNatural.width > 0 ? (sizes) => {
              onNormalizeHotspotSizes?.(scene.id, layout.contentRect, sizes);
            } : undefined}
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
      {scene !== null && (
        <chakra.div data-testid="scene-canvas-view-controls" style={{
          position: "absolute", left: 12, bottom: 12, zIndex: 10,
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
          maxWidth: "calc(100% - 24px)", padding: "6px 8px", borderRadius: 6,
          background: tokens.bgElevated, border: `1px solid ${tokens.border}`, color: tokens.textMuted,
        }}>
          <chakra.span data-testid="scene-canvas-zoom" style={{ fontVariantNumeric: "tabular-nums", minWidth: 38 }}>
            {Math.round(viewport.zoom * 100)}%
          </chakra.span>
          <Button {...editorButtonProps(tokens)} size="sm" onClick={resetViewport}>适应画布</Button>
          <chakra.span style={{ fontSize: 11 }}>Ctrl + 滚轮缩放 · 中键拖动画布</chakra.span>
        </chakra.div>
      )}
    </chakra.div>
  );
}
