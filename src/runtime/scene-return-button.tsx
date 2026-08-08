/**
 * scene-return-button.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 运行时浮层「场景返回」按钮：当返回栈存在有效目标且与当前场景不同时显示，
 * 点击后弹出栈顶并切换场景。
 *
 * 定位策略：与 SceneView 共用同一 host（三层 shell 的 body 容器），通过 ResizeObserver
 * 自测 host 尺寸，复用 {@link fitDesignToHost}（margin=1，与 scene-view 一致）计算 world
 * transform，按钮按设计像素坐标 {@link SceneReturnButtonConfig.rect} 放置，从而与底图 /
 * 交互点层完美对齐，缩放跟随场景画幅。
 *
 * 显示条件（全满足才渲染）：
 * 1. `config.enabled === true`
 * 2. `parseSceneReturnStackJson(stackJson)` 非空
 * 3. `peekValidSceneReturn(stack, scenes)` 命中且 `!== currentSceneId`
 *
 * 交互：
 * - 悬停合并 `hoverStyle` / `hoverImageSrc`
 * - 点击真正 `popValidSceneReturn` 后回调 `onReturn(targetId, nextStack)`
 * - 仅按钮本身接收指针事件，外层容器 pointerEvents:none，避免遮挡场景交互
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  parseSceneReturnStackJson,
  peekValidSceneReturn,
  popValidSceneReturn,
} from "../domain/scene-return-stack";
import type {
  SceneDefinition,
  SceneReturnButtonConfig,
  UiBoxStyle,
  UiTextStyle,
} from "../domain/types";
import { resolveAssetUrl } from "../shared/resolve-asset-url";
import { fitDesignToHost } from "../shared/scene-layout";

/**
 * SceneReturnButton 组件属性。
 */
export interface SceneReturnButtonProps {
  /** 返回按钮外观与布局预设（来自 `SceneUiConfig.sceneReturn`） */
  config: SceneReturnButtonConfig;

  /** 存档中的返回栈 JSON 字符串 */
  stackJson: string;

  /** 当前场景 id（用于判断按钮是否需要显示） */
  currentSceneId: string;

  /** 场景库（校验栈顶 id 是否仍有效） */
  scenes: SceneDefinition[];

  /** 设计分辨率宽（与 SceneView 一致） */
  designWidth: number;

  /** 设计分辨率高 */
  designHeight: number;

  /**
   * 视口宽（CSS px）。>0 时优先使用；否则组件自测 host 尺寸。
   * 三层 shell 暂无独立 resize 状态，传 0 即可。
   */
  viewportWidth?: number;

  /** 视口高（CSS px）。同上 */
  viewportHeight?: number;

  /**
   * 点击返回按钮后回调；组件已完成出栈，shell 负责写存档 + 切场景。
   *
   * @param nextSceneId - 弹出的有效目标场景 id
   * @param nextStack - 弹出后的剩余栈（字符串数组，未序列化）
   */
  onReturn: (nextSceneId: string, nextStack: string[]) => void;
}

/**
 * 将 UiBoxStyle + UiTextStyle 合并为 React CSSProperties。
 *
 * @param box - 盒模型样式
 * @param text - 文本样式
 * @returns CSSProperties
 */
function mergeStyle(
  box: UiBoxStyle,
  text: UiTextStyle,
): React.CSSProperties {
  return {
    background: box.background,
    borderColor: box.borderColor,
    borderWidth:
      typeof box.borderWidth === "number" ? `${box.borderWidth}px` : undefined,
    borderRadius:
      typeof box.borderRadius === "number" ? `${box.borderRadius}px` : undefined,
    opacity: box.opacity,
    boxShadow:
      typeof box.shadow === "number" && box.shadow > 0
        ? `0 0 ${box.shadow}px rgba(0,0,0,0.45)`
        : undefined,
    color: text.color,
    fontSize:
      typeof text.fontSize === "number" ? `${text.fontSize}px` : undefined,
    fontWeight: text.fontWeight,
  };
}

/**
 * 运行时场景返回按钮浮层。
 *
 * @param props - SceneReturnButtonProps
 * @returns 浮层按钮元素，或无需显示时 null
 *
 * @example
 * ```tsx
 * <SceneReturnButton
 *   config={sceneUi.sceneReturn}
 *   stackJson={returnStackJson}
 *   currentSceneId={currentSceneId}
 *   scenes={library.scenes}
 *   designWidth={designSize.width}
 *   designHeight={designSize.height}
 *   onReturn={(id, stack) => {
 *     setReturnStackJson(stringifySceneReturnStack(stack));
 *     setCurrentSceneId(id);
 *   }}
 * />
 * ```
 */
export function SceneReturnButton({
  config,
  stackJson,
  currentSceneId,
  scenes,
  designWidth,
  designHeight,
  viewportWidth = 0,
  viewportHeight = 0,
  onReturn,
}: SceneReturnButtonProps): React.ReactElement | null {
  const ctx = useExtensionContext();
  const hostRef = useRef<HTMLDivElement>(null);
  const [measuredSize, setMeasuredSize] = useState({
    width: viewportWidth,
    height: viewportHeight,
  });

  /**
   * 解析返回栈并预览栈顶有效目标。
   */
  const peek = useMemo(() => {
    if (!config.enabled) {
      return null;
    }

    const stack = parseSceneReturnStackJson(stackJson);

    if (stack.length === 0) {
      return null;
    }

    const targetId = peekValidSceneReturn(stack, scenes);

    if (targetId === null || targetId === currentSceneId) {
      return null;
    }

    return { stack, targetId };
  }, [config.enabled, stackJson, scenes, currentSceneId]);

  /**
   * 自测 host 尺寸（与 SceneView 同一 host，保证 world transform 一致）。
   *
   * 当外部传入有效 viewportWidth/Height 时直接采用，跳过测量。
   */
  useEffect(() => {
    if (viewportWidth > 0 && viewportHeight > 0) {
      setMeasuredSize({ width: viewportWidth, height: viewportHeight });
      return;
    }

    const host = hostRef.current;

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

      setMeasuredSize((prev) =>
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
  }, [viewportWidth, viewportHeight]);

  /**
   * 与 SceneView 一致的 world transform（margin=1）。
   */
  const world = useMemo(
    () =>
      fitDesignToHost(
        measuredSize.width,
        measuredSize.height,
        designWidth,
        designHeight,
        1,
      ),
    [measuredSize.width, measuredSize.height, designWidth, designHeight],
  );

  const [hovered, setHovered] = useState(false);

  /**
   * 当前生效的图片 URI（hover 时优先 hoverImageSrc）。
   */
  const imageSrc = hovered && config.hoverImageSrc
    ? config.hoverImageSrc
    : config.imageSrc;
  const imageUrl = useMemo(
    () =>
      imageSrc
        ? resolveAssetUrl(imageSrc, ctx.asset?.resolve?.bind(ctx.asset))
        : "",
    [imageSrc, ctx.asset],
  );

  /**
   * 点击：真正出栈并回调。
   */
  const handleClick = useCallback((): void => {
    if (peek === null) {
      return;
    }

    const { nextStack, targetId } = popValidSceneReturn(peek.stack, scenes);

    if (targetId === null) {
      return;
    }

    onReturn(targetId, nextStack);
  }, [peek, scenes, onReturn]);

  if (peek === null) {
    return null;
  }

  const rect = config.rect;
  const width =
    typeof rect.w === "number" && rect.w > 0 ? rect.w : 120;
  const height =
    typeof rect.h === "number" && rect.h > 0 ? rect.h : 40;

  const baseStyle = mergeStyle(config.style, config.style);
  const hoverStyle =
    hovered && config.hoverStyle !== undefined
      ? mergeStyle(
          { ...config.style, ...config.hoverStyle },
          { ...config.style, ...config.hoverStyle },
        )
      : baseStyle;

  return (
    <div
      ref={hostRef}
      data-testid="scene-return-button-layer"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: designWidth,
          height: designHeight,
          transform: `translate(${world.offsetX}px, ${world.offsetY}px) scale(${world.scale})`,
          transformOrigin: "0 0",
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          data-testid="scene-return-button"
          onClick={handleClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: "absolute",
            left: rect.x,
            top: rect.y,
            width,
            height,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            appearance: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            pointerEvents: "auto",
            backgroundImage: imageUrl ? `url("${imageUrl}")` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            ...hoverStyle,
          }}
        >
          {config.label}
        </button>
      </div>
    </div>
  );
}
