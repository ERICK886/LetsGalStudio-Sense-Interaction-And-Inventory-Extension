/**
 * ui-overlay.ts
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.1.0
 *
 * UI 区块自由图层：规范化、默认矩形、选中 id 约定。
 */

import { normalizeFaIconName } from "../shared/font-awesome";
import { createId } from "./id";
import type {
  UiBoxStyle,
  UiOverlayElement,
  UiOverlayKind,
  UiOverlayRole,
  UiRect,
  UiTextStyle,
} from "./types";
import { cloneUiButtonSkin, normalizeUiButtonSkin } from "./ui-button-skin";
import {
  normalizeUiBoxStyle,
  normalizeUiRect,
  normalizeUiTextStyle,
} from "./ui-style";

/** 各图层种类在编辑器工具条上的默认 FA 图标 */
export const UI_OVERLAY_KIND_ICONS: Record<UiOverlayKind, string> = {
  text: "font",
  image: "image",
  button: "hand-pointer",
  rect: "square",
  line: "minus",
  mask: "clone",
  select: "caret-down",
  switch: "toggle-on",
  slider: "sliders",
  checkbox: "square-check",
  input: "i-cursor",
  tabs: "folder",
};

/** 选中 id 前缀：`overlay:<elementId>` */
export const OVERLAY_SELECTION_PREFIX = "overlay:";

/** 图层种类中文名 */
export const UI_OVERLAY_KIND_LABELS: Record<UiOverlayKind, string> = {
  text: "文字",
  image: "图片",
  button: "按钮",
  rect: "矩形",
  line: "线条",
  mask: "背景遮罩",
  select: "下拉",
  switch: "开关",
  slider: "滑块",
  checkbox: "勾选框",
  input: "输入框",
  tabs: "页签",
};

const ALL_KINDS = Object.keys(UI_OVERLAY_KIND_LABELS) as UiOverlayKind[];

const ALL_ROLES: readonly UiOverlayRole[] = [
  "none",
  "closeBag",
  "craft",
  "toggleMode",
  "openBag",
];

/**
 * @param id - 图层元素 id
 * @returns 编辑器选中用 id
 */
export function overlaySelectionId(id: string): string {
  return `${OVERLAY_SELECTION_PREFIX}${id}`;
}

/**
 * @param raw - 原始 role
 * @returns 合法 role
 */
export function normalizeUiOverlayRole(raw: unknown): UiOverlayRole {
  if (typeof raw === "string" && (ALL_ROLES as string[]).includes(raw)) {
    return raw as UiOverlayRole;
  }

  return "none";
}

/**
 * @param selectionId - 选中 id
 * @returns 图层元素 id；非 overlay 时 null
 */
export function parseOverlaySelectionId(selectionId: string): string | null {
  if (!selectionId.startsWith(OVERLAY_SELECTION_PREFIX)) {
    return null;
  }

  const id = selectionId.slice(OVERLAY_SELECTION_PREFIX.length).trim();

  return id.length > 0 ? id : null;
}

/**
 * @param kind - 图层种类
 * @returns 是否合法
 */
function isOverlayKind(kind: unknown): kind is UiOverlayKind {
  return typeof kind === "string" && (ALL_KINDS as string[]).includes(kind);
}

/**
 * 新建图层时的默认矩形（相对舞台中心附近）。
 *
 * @param kind - 种类
 * @param designW - 设计宽
 * @param designH - 设计高
 * @returns Required UiRect
 */
export function defaultOverlayRect(
  kind: UiOverlayKind,
  designW: number,
  designH: number,
): Required<UiRect> {
  const cx = Math.round(designW / 2);
  const cy = Math.round(designH / 2);

  switch (kind) {
    case "mask":
      return { x: 0, y: 0, w: Math.max(1, designW), h: Math.max(1, designH) };
    case "line":
      return { x: cx - 200, y: cy, w: 400, h: 24 };
    case "switch":
      return { x: cx - 48, y: cy - 24, w: 96, h: 48 };
    case "slider":
      return { x: cx - 240, y: cy - 24, w: 480, h: 48 };
    case "checkbox":
      return { x: cx - 120, y: cy - 22, w: 240, h: 44 };
    case "tabs":
      return { x: cx - 280, y: cy - 160, w: 560, h: 320 };
    case "image":
      return { x: cx - 120, y: cy - 90, w: 240, h: 180 };
    case "button":
      return { x: cx - 100, y: cy - 28, w: 200, h: 56 };
    case "select":
    case "input":
      return { x: cx - 160, y: cy - 28, w: 320, h: 56 };
    case "rect":
      return { x: cx - 160, y: cy - 100, w: 320, h: 200 };
    case "text":
    default:
      return { x: cx - 160, y: cy - 24, w: 320, h: 48 };
  }
}

/**
 * 创建带默认值的新图层。
 *
 * @param kind - 种类
 * @param designW - 设计宽
 * @param designH - 设计高
 * @returns UiOverlayElement
 */
export function createUiOverlayElement(
  kind: UiOverlayKind,
  designW: number,
  designH: number,
): UiOverlayElement {
  const label = UI_OVERLAY_KIND_LABELS[kind];
  const rect = defaultOverlayRect(kind, designW, designH);
  const baseStyle: UiBoxStyle & UiTextStyle = {
    background:
      kind === "mask"
        ? "rgba(5, 8, 12, 0.55)"
        : kind === "rect" || kind === "button" || kind === "select" || kind === "input"
          ? "rgba(14, 18, 24, 0.88)"
          : undefined,
    borderColor:
      kind === "rect" || kind === "button"
        ? "rgba(255,255,255,0.12)"
        : undefined,
    borderWidth: kind === "rect" || kind === "button" ? 1 : undefined,
    borderRadius: kind === "button" ? 10 : kind === "rect" ? 8 : undefined,
    color: "#f2f5f7",
    fontSize: kind === "text" ? 22 : 16,
    fontWeight: kind === "text" || kind === "button" ? 650 : 500,
    label: kind === "button" ? "按钮" : kind === "text" ? "文字内容" : undefined,
  };

  return {
    id: createId("ov"),
    kind,
    name: label,
    rect,
    zIndex: 10,
    rotation: 0,
    flipH: false,
    flipV: false,
    opacity: kind === "mask" ? 0.72 : 1,
    customCss: "",
    role: "none",
    style: baseStyle,
    props: {
      text:
        kind === "text"
          ? "文字内容"
          : kind === "button"
            ? "按钮"
            : kind === "checkbox"
              ? "勾选项"
              : undefined,
      options:
        kind === "select"
          ? "选项一,选项二,选项三"
          : kind === "tabs"
            ? "页签一,页签二"
            : undefined,
      initialIndex: 0,
      initialOn: true,
      initialValue: 60,
      showValue: true,
      placeholder: "请输入…",
      maxLength: 0,
      thickness: 2,
      lineStyle: "solid",
      tabGap: 8,
    },
  };
}

/**
 * 深拷贝单个图层。
 *
 * @param el - 源
 * @returns 副本
 */
export function cloneUiOverlayElement(el: UiOverlayElement): UiOverlayElement {
  return {
    ...el,
    role: el.role ?? "none",
    rect: { ...el.rect },
    style: { ...el.style },
    skin: el.skin ? cloneUiButtonSkin(el.skin) : undefined,
    props: { ...el.props },
  };
}

/**
 * @param list - 源列表
 * @returns 深拷贝
 */
export function cloneUiOverlays(
  list: readonly UiOverlayElement[] | undefined,
): UiOverlayElement[] {
  return (list ?? []).map(cloneUiOverlayElement);
}

/**
 * 规范化单图层；非法则 null。
 *
 * @param raw - 原始对象
 * @returns UiOverlayElement 或 null
 */
export function normalizeUiOverlayElement(raw: unknown): UiOverlayElement | null {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  if (!isOverlayKind(obj.kind)) {
    return null;
  }

  const kind = obj.kind;
  const id =
    typeof obj.id === "string" && obj.id.trim().length > 0
      ? obj.id.trim()
      : createId("ov");
  const name =
    typeof obj.name === "string" && obj.name.trim().length > 0
      ? obj.name.trim()
      : UI_OVERLAY_KIND_LABELS[kind];

  const fallbackRect = defaultOverlayRect(kind, 1920, 1080);
  const rect = normalizeUiRect(
    obj.rect as Partial<UiRect> | undefined,
    fallbackRect,
  );
  const requiredRect: Required<UiRect> = {
    x: rect.x,
    y: rect.y,
    w: typeof rect.w === "number" && rect.w > 0 ? rect.w : fallbackRect.w,
    h: typeof rect.h === "number" && rect.h > 0 ? rect.h : fallbackRect.h,
  };

  const styleFallback: UiBoxStyle & UiTextStyle = {
    color: "#f2f5f7",
    fontSize: 16,
  };
  const style: UiBoxStyle & UiTextStyle = {
    ...normalizeUiBoxStyle(
      obj.style as Partial<UiBoxStyle> | undefined,
      styleFallback,
    ),
    ...normalizeUiTextStyle(
      obj.style as Partial<UiTextStyle> | undefined,
      styleFallback,
    ),
  };

  const propsRaw =
    obj.props !== null && typeof obj.props === "object"
      ? (obj.props as Record<string, unknown>)
      : {};

  const skin = normalizeUiButtonSkin(obj.skin ?? obj);
  const rotation =
    typeof obj.rotation === "number" && Number.isFinite(obj.rotation)
      ? obj.rotation
      : 0;
  const opacityRaw =
    typeof obj.opacity === "number" && Number.isFinite(obj.opacity)
      ? obj.opacity
      : 1;
  const opacity =
    opacityRaw > 1 ? Math.min(1, opacityRaw / 100) : Math.max(0, Math.min(1, opacityRaw));

  const lineStyle =
    propsRaw.lineStyle === "dashed" || propsRaw.lineStyle === "dotted"
      ? propsRaw.lineStyle
      : "solid";

  return {
    id,
    kind,
    name,
    rect: requiredRect,
    zIndex:
      typeof obj.zIndex === "number" && Number.isFinite(obj.zIndex)
        ? Math.round(obj.zIndex)
        : 10,
    rotation,
    flipH: obj.flipH === true,
    flipV: obj.flipV === true,
    opacity,
    customCss: typeof obj.customCss === "string" ? obj.customCss : "",
    role: normalizeUiOverlayRole(obj.role),
    style,
    skin: Object.keys(skin).length > 0 ? skin : undefined,
    props: {
      text: typeof propsRaw.text === "string" ? propsRaw.text : undefined,
      icon: normalizeFaIconName(propsRaw.icon) || undefined,
      asset: typeof propsRaw.asset === "string" ? propsRaw.asset : undefined,
      thickness:
        typeof propsRaw.thickness === "number" && propsRaw.thickness > 0
          ? propsRaw.thickness
          : 2,
      lineStyle,
      options: typeof propsRaw.options === "string" ? propsRaw.options : undefined,
      initialIndex:
        typeof propsRaw.initialIndex === "number" &&
        Number.isFinite(propsRaw.initialIndex)
          ? Math.max(0, Math.floor(propsRaw.initialIndex))
          : 0,
      initialOn: propsRaw.initialOn !== false,
      initialValue:
        typeof propsRaw.initialValue === "number" &&
        Number.isFinite(propsRaw.initialValue)
          ? Math.max(0, Math.min(100, propsRaw.initialValue))
          : 60,
      showValue: propsRaw.showValue !== false,
      placeholder:
        typeof propsRaw.placeholder === "string"
          ? propsRaw.placeholder
          : undefined,
      maxLength:
        typeof propsRaw.maxLength === "number" && propsRaw.maxLength >= 0
          ? Math.floor(propsRaw.maxLength)
          : 0,
      onAsset: typeof propsRaw.onAsset === "string" ? propsRaw.onAsset : undefined,
      offAsset:
        typeof propsRaw.offAsset === "string" ? propsRaw.offAsset : undefined,
      trackAsset:
        typeof propsRaw.trackAsset === "string" ? propsRaw.trackAsset : undefined,
      fillAsset:
        typeof propsRaw.fillAsset === "string" ? propsRaw.fillAsset : undefined,
      handleAsset:
        typeof propsRaw.handleAsset === "string"
          ? propsRaw.handleAsset
          : undefined,
      checkedAsset:
        typeof propsRaw.checkedAsset === "string"
          ? propsRaw.checkedAsset
          : undefined,
      uncheckedAsset:
        typeof propsRaw.uncheckedAsset === "string"
          ? propsRaw.uncheckedAsset
          : undefined,
      tabAsset:
        typeof propsRaw.tabAsset === "string" ? propsRaw.tabAsset : undefined,
      activeTabAsset:
        typeof propsRaw.activeTabAsset === "string"
          ? propsRaw.activeTabAsset
          : undefined,
      tabGap:
        typeof propsRaw.tabGap === "number" && Number.isFinite(propsRaw.tabGap)
          ? Math.max(0, propsRaw.tabGap)
          : 8,
    },
  };
}

/**
 * 规范化图层列表。
 *
 * @param raw - 原始数组
 * @returns UiOverlayElement[]
 */
export function normalizeUiOverlays(raw: unknown): UiOverlayElement[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const out: UiOverlayElement[] = [];

  for (const item of raw) {
    const el = normalizeUiOverlayElement(item);

    if (el !== null) {
      out.push(el);
    }
  }

  return out;
}

/**
 * 按 zIndex 升序排序（同 z 保持原序）。
 *
 * @param list - 图层
 * @returns 新数组
 */
export function sortOverlaysByZ(
  list: readonly UiOverlayElement[],
): UiOverlayElement[] {
  return list
    .map((el, index) => ({ el, index }))
    .sort((a, b) => a.el.zIndex - b.el.zIndex || a.index - b.index)
    .map((x) => x.el);
}

/**
 * 按给定 id 顺序重排图层，并复用原有 zIndex 档位（小→大对应列表上→下）。
 *
 * @param overlays - 当前图层
 * @param orderedIds - 期望顺序的元素 id（可只含子集；未列出的追加在末尾）
 * @returns 新数组（深拷贝元素）
 */
export function reorderOverlaysByIds(
  overlays: readonly UiOverlayElement[],
  orderedIds: readonly string[],
): UiOverlayElement[] {
  if (overlays.length === 0) {
    return [];
  }

  const byId = new Map(
    overlays.map((el) => [el.id, cloneUiOverlayElement(el)]),
  );
  const ordered: UiOverlayElement[] = [];

  for (const id of orderedIds) {
    const el = byId.get(id);

    if (el) {
      ordered.push(el);
      byId.delete(id);
    }
  }

  for (const el of overlays) {
    const remaining = byId.get(el.id);

    if (remaining) {
      ordered.push(remaining);
      byId.delete(el.id);
    }
  }

  const zSlots = overlays
    .map((el) => el.zIndex)
    .sort((a, b) => a - b);

  return ordered.map((el, index) => ({
    ...el,
    zIndex: zSlots[index] ?? index * 10,
  }));
}

/**
 * 拆分逗号分隔选项。
 *
 * @param raw - 原文
 * @returns 非空项
 */
export function splitOverlayOptions(raw: string | undefined): string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }

  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
