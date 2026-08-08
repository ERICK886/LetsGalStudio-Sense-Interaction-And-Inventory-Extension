/**
 * types.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景交互扩展的领域类型定义（纯类型，无运行时逻辑）。
 */
export type MotionPresetId =
  | "none"
  | "fade"
  | "scale"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight";

export interface MotionSide {
  preset: MotionPresetId;
  delayMs: number;
  durationMs: number;
  customCss: string;
}

export interface ElementMotion {
  enter: MotionSide;
  exit: MotionSide;
}

export type LetterboxMode = "black" | "white" | "custom";

export type HotspotLabelMode = "hover" | "always" | "hidden";

export interface HotspotLabel {
  text: string;
  mode: HotspotLabelMode;
  offsetX?: number;
  offsetY?: number;
  customCss: string;
  motion: ElementMotion;
}

/** 获得物品 Toast 相对热区锚点的方位 */
export type ToastPlacement =
  | "above"
  | "below"
  | "left"
  | "right"
  | "center";

export type SceneAction =
  | { type: "none" }
  | { type: "openScene"; sceneIdOrName: string }
  | {
      type: "giveItem";
      itemId: string;
      amount: number;
      toastText: string;
      toastMotion: ElementMotion;
    };

export interface HotspotElement {
  type: "hotspot";
  id: string;
  name: string;
  x: number;
  y: number;
  visual: { kind: "image"; src: string; width?: number; height?: number };
  hoverShadow: { enabled: boolean };
  label?: HotspotLabel;
  actions: SceneAction[];
  once: boolean;
  visibleByDefault: boolean;
  customCss: string;
  motion: ElementMotion;
}

export interface SceneDefinition {
  id: string;
  name: string;
  baseImage: string;
  hotspots: HotspotElement[];
  letterboxMode?: LetterboxMode;
  letterboxColor?: string;
  customCss?: string;
  motion?: ElementMotion;
}

export interface ScenesLibraryFile {
  version: 1;
  scenes: SceneDefinition[];
}

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  detailImage: string;
  stackable: boolean;
  maxStack?: number;
}

export interface ItemsLibraryFile {
  version: 1;
  items: ItemDefinition[];
}

/** 配方原料/产物一行 */
export interface RecipeItemAmount {
  itemId: string;
  /** 数量；规范化后 >= 1 */
  count: number;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  ingredients: RecipeItemAmount[];
  products: RecipeItemAmount[];
  description?: string;
}

export interface RecipesLibraryFile {
  version: 1;
  recipes: RecipeDefinition[];
}

export type InventoryEntry =
  | { kind: "stack"; itemId: string; count: number; lastGainedAt: number }
  | { kind: "unique"; instanceId: string; itemId: string; lastGainedAt: number };

export interface InventoryState {
  entries: InventoryEntry[];
}

export interface SceneProgress {
  consumed: Record<string, boolean>;
  visibility?: Record<string, boolean>;
}

export type InventoryHudMode = "withScene" | "always";

/** 自由布局节点的矩形区域（设计像素坐标） */
export interface UiRect {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

/** 自由布局节点的盒模型视觉样式 */
export interface UiBoxStyle {
  background?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  shadow?: number;
}

/** 自由布局节点的文本样式 */
export interface UiTextStyle {
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  label?: string;
}

/** 全局获得物品 Toast 样式与锚点配置（version 1） */
export interface ItemToastConfig {
  version: 1;
  placement: ToastPlacement;
  offsetX: number;
  offsetY: number;
  gap: number;
  style: UiBoxStyle & UiTextStyle;
}

/**
 * 物品栏 HUD 自由布局配置（version 2，节点化）。
 *
 * v1 扁平 `left/top/slotSize/...` 仅在 `normalizeInventoryHud` 输入侧迁移，不再作为正式字段。
 */
export interface InventoryHudConfig {
  version: 2;
  accent: string;
  customCss: string;
  nodes: {
    quickbarRoot: {
      rect: { x: number; y: number };
      direction: "column" | "row";
      slotSize: number;
      gap: number;
      slotStyle: UiBoxStyle;
      badgeStyle: UiBoxStyle & UiTextStyle;
    };
    openBagButton: {
      layout: "belowRoot" | "absolute";
      rect?: UiRect;
      style: UiBoxStyle & UiTextStyle;
    };
  };
}

/**
 * 全屏背包自由布局配置（version 2，节点化）。
 *
 * v1 扁平 `pagePaddingX/pagePaddingY/detailRatio/...` 仅在
 * `normalizeBackpackScreen` 输入侧迁移，不再作为正式字段。
 */
export interface BackpackScreenConfig {
  version: 2;
  accent: string;
  nodes: {
    backdrop: { style: UiBoxStyle };
    panelChrome: { rect: UiRect; style: UiBoxStyle };
    titleBlock: {
      rect: UiRect;
      eyebrow?: UiTextStyle;
      title?: UiTextStyle;
      modeLink?: UiTextStyle;
    };
    closeButton: { rect: UiRect; style: UiBoxStyle & UiTextStyle };
    itemGrid: {
      rect: UiRect;
      cellMin: number;
      style: UiBoxStyle;
      selectedStyle?: UiBoxStyle;
    };
    detailPanel: {
      rect: UiRect;
      heroHeight: number;
      padding: number;
      style: UiBoxStyle;
    };
    craftButton: {
      offsetY?: number;
      style: UiBoxStyle & UiTextStyle;
    };
  };
}

/** 全屏背包可重置 / 选中的节点 id */
export type BackpackNodeId =
  | "backdrop"
  | "panelChrome"
  | "titleBlock"
  | "closeButton"
  | "itemGrid"
  | "detailPanel"
  | "craftButton";
