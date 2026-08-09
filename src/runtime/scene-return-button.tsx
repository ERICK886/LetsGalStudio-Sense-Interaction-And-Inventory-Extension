/**
 * scene-return-button.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.3
 *
 * 运行时浮层「场景返回」按钮：当返回栈存在有效目标且与当前场景不同时显示，
 * 点击后弹出栈顶并切换场景。
 *
 * 层级：zIndex 100，高于预览内嵌背包 HUD 叠层（90）与快捷栏，低于全屏背包弹层（1100）。
 *
 * 测量：host 层始终挂载（即使按钮隐藏），用 useLayoutEffect 同步量尺寸，
 * 避免「先 return null → 无 host → scale=NaN → 有栈后按钮不可见」。
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { fitDesignToHost } from "../shared/scene-layout";
import { useUiButtonSkin } from "./use-ui-button-skin";

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
  const borderWidth =
    typeof box.borderWidth === "number" ? box.borderWidth : undefined;

  return {
    // 用 backgroundColor，避免与 backgroundImage 的 background 简写互相覆盖
    backgroundColor: box.background,
    borderColor: box.borderColor,
    borderWidth:
      borderWidth !== undefined ? `${borderWidth}px` : undefined,
    borderStyle: borderWidth !== undefined && borderWidth > 0 ? "solid" : undefined,
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
}: SceneReturnButtonProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const buttonSkin = useUiButtonSkin(config);
  const [measuredSize, setMeasuredSize] = useState({
    width: typeof viewportWidth === "number" && viewportWidth > 0 ? viewportWidth : 0,
    height:
      typeof viewportHeight === "number" && viewportHeight > 0 ? viewportHeight : 0,
  });

  /**
   * 解析返回栈并预览栈顶有效目标（与当前场景不同才可显示）。
   */
  const peek = useMemo(() => {
    if (!config.enabled) {
      return null as { stack: string[]; targetId: string } | null;
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
   * 自测 host 尺寸：host 始终挂载，layout 阶段同步量一次，避免首帧 NaN scale。
   */
  useLayoutEffect(() => {
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

      applySize(entry.contentRect.width, entry.contentRect.height);
    });

    ro.observe(host);
    const rect = host.getBoundingClientRect();

    applySize(rect.width, rect.height);

    return () => ro.disconnect();
  }, [viewportWidth, viewportHeight]);

  /**
   * 与 SceneView 一致的 world transform（margin=1）。
   * host 尚未测到时用 1×1 占位，避免 NaN。
   */
  const world = useMemo(
    () =>
      fitDesignToHost(
        measuredSize.width > 0 ? measuredSize.width : 1,
        measuredSize.height > 0 ? measuredSize.height : 1,
        designWidth,
        designHeight,
        1,
      ),
    [measuredSize.width, measuredSize.height, designWidth, designHeight],
  );

  const layoutReady = measuredSize.width > 1 && measuredSize.height > 1;

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

  const rect = config.rect;
  const designW =
    typeof rect.w === "number" && rect.w > 0 ? rect.w : 120;
  const designH =
    typeof rect.h === "number" && rect.h > 0 ? rect.h : 40;

  /**
   * 用 host CSS 像素定位（offset + design×scale），避免嵌套 scale 在部分环境下首帧不可见。
   */
  const screenLeft = world.offsetX + (rect.x ?? 0) * world.scale;
  const screenTop = world.offsetY + (rect.y ?? 0) * world.scale;
  const screenW = designW * world.scale;
  const screenH = designH * world.scale;

  const baseStyle = mergeStyle(config.style, config.style);
  const hoverActive =
    buttonSkin.phase === "hover" || buttonSkin.phase === "pressed";
  const activeStyle =
    hoverActive && config.hoverStyle !== undefined
      ? mergeStyle(
          { ...config.style, ...config.hoverStyle },
          { ...config.style, ...config.hoverStyle },
        )
      : baseStyle;

  const showButton = peek !== null && layoutReady;

  return (
    <div
      ref={hostRef}
      data-testid="scene-return-button-layer"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        /**
         * 须高于 preview-shell 内嵌背包叠层（zIndex 90），
         * 否则按钮在左上角会被快捷栏盖住（日志显示、画面看不见）。
         */
        zIndex: 100,
      }}
    >
      {showButton ? (
        <button
          type="button"
          data-testid="scene-return-button"
          aria-label={config.label || "返回"}
          onClick={handleClick}
          {...buttonSkin.pointerHandlers}
          style={{
            position: "absolute",
            left: screenLeft,
            top: screenTop,
            width: Math.max(44, screenW),
            height: Math.max(32, screenH),
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            appearance: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            pointerEvents: "auto",
            zIndex: 1,
            ...activeStyle,
            ...buttonSkin.backgroundImageStyle,
          }}
        >
          {config.label}
        </button>
      ) : null}
    </div>
  );
}
