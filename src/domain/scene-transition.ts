/**
 * scene-transition.ts
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.1.0
 *
 * 场景↔场景切换转场：模式规范化、时长与覆盖入场位姿。
 */

import { MOTION_MS_MAX } from "./motion";
import type {
  MotionPresetId,
  SceneDefinition,
  SceneTransitionMode,
} from "./types";

/** 默认转场时长（毫秒） */
export const DEFAULT_SCENE_TRANSITION_MS = 420;

/** 层位姿（外层 wrapper：opacity + 位移% + scale） */
export interface SceneLayerPose {
  opacity: number;
  /** 相对自身宽度的 translateX% */
  txPct: number;
  /** 相对自身高度的 translateY% */
  tyPct: number;
  scale: number;
}

/**
 * 规范化场景切换转场模式。
 *
 * @param raw - 原始值
 * @returns `fade` | `cover`
 */
export function normalizeSceneTransitionMode(
  raw: unknown,
): SceneTransitionMode {
  return raw === "cover" ? "cover" : "fade";
}

/**
 * 解析进入场景时的转场时长（优先 motion.enter.durationMs）。
 *
 * @param scene - 目标场景
 * @returns 毫秒，钳制到 [0, MOTION_MS_MAX]
 */
export function resolveSceneTransitionMs(scene: SceneDefinition): number {
  const d = scene.motion?.enter?.durationMs;

  if (typeof d === "number" && Number.isFinite(d) && d >= 0) {
    return Math.min(MOTION_MS_MAX, Math.round(d));
  }

  return DEFAULT_SCENE_TRANSITION_MS;
}

/**
 * 解析进入场景时的转场延迟。
 *
 * @param scene - 目标场景
 * @returns 毫秒
 */
export function resolveSceneTransitionDelayMs(scene: SceneDefinition): number {
  const d = scene.motion?.enter?.delayMs;

  if (typeof d === "number" && Number.isFinite(d) && d >= 0) {
    return Math.min(MOTION_MS_MAX, Math.round(d));
  }

  return 0;
}

/**
 * 静止位姿（完全显示、无偏移）。
 *
 * @returns SceneLayerPose
 */
export function restSceneLayerPose(): SceneLayerPose {
  return { opacity: 1, txPct: 0, tyPct: 0, scale: 1 };
}

/**
 * 隐藏位姿（全透明、无偏移）。
 *
 * @returns SceneLayerPose
 */
export function hiddenSceneLayerPose(): SceneLayerPose {
  return { opacity: 0, txPct: 0, tyPct: 0, scale: 1 };
}

/**
 * 覆盖转场：新层入场起始位姿（由入场预设决定方向/缩放）。
 *
 * @param preset - motion.enter.preset
 * @returns 入场起始位姿
 */
export function coverEnterStartPose(
  preset: MotionPresetId | undefined,
): SceneLayerPose {
  switch (preset) {
    case "slideLeft":
      return { opacity: 1, txPct: -100, tyPct: 0, scale: 1 };
    case "slideRight":
      return { opacity: 1, txPct: 100, tyPct: 0, scale: 1 };
    case "slideUp":
      return { opacity: 1, txPct: 0, tyPct: 100, scale: 1 };
    case "slideDown":
      return { opacity: 1, txPct: 0, tyPct: -100, scale: 1 };
    case "scale":
      return { opacity: 1, txPct: 0, tyPct: 0, scale: 0.92 };
    case "fade":
    case "none":
    default:
      // 纯透明度覆盖：新层从透明叠上
      return { opacity: 0, txPct: 0, tyPct: 0, scale: 1 };
  }
}
