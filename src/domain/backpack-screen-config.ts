/**
 * backpack-screen-config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.4.2
 *
 * 全屏背包布局默认值、v1→v2 迁移与 JSON 规范化（参考设计尺寸 1920×1080）。
 * 默认几何：标题/关闭钮落在面板顶栏内，网格与详情分列于标题下方（对齐设计稿）。
 */

import type {
  BackpackNodeId,
  BackpackScreenConfig,
  UiBoxStyle,
  UiOverlayElement,
  UiRect,
  UiTextStyle,
} from "./types";
import {
  cloneUiButtonSkin,
  normalizeUiButtonSkin,
} from "./ui-button-skin";
import {
  buildDefaultLayerOrder,
  normalizeLayerOrder,
  syncOverlaysZIndexFromLayerOrder,
} from "./layer-order";
import {
  cloneUiOverlayElement,
  cloneUiOverlays,
  normalizeUiOverlays,
  overlaySelectionId,
} from "./ui-overlay";
import {
  normalizeUiBoxStyle,
  normalizeUiRect,
  normalizeUiTextStyle,
} from "./ui-style";

/** 全屏背包侧栏固定功能节点（可拖排序） */
export const BAG_FIXED_LAYER_IDS = ["itemGrid", "detailPanel"] as const;

/** 全屏背包 chrome 图层稳定 id（编辑器不可删，normalize 会补齐） */
export const BAG_CHROME_OVERLAY_IDS = {
  backdrop: "bag-chrome-backdrop",
  panel: "bag-chrome-panel",
  eyebrow: "bag-chrome-eyebrow",
  title: "bag-chrome-title",
  accentLine: "bag-chrome-accent-line",
  mode: "bag-chrome-mode",
  close: "bag-chrome-close",
  craft: "bag-chrome-craft",
} as const;

/**
 * 全屏背包默认侧栏 / 叠放顺序（上=后、下=前）。
 * 遮罩与主面板垫底，功能区居中，标题与按钮靠前。
 */
export const BAG_DEFAULT_LAYER_ORDER = [
  overlaySelectionId(BAG_CHROME_OVERLAY_IDS.backdrop),
  overlaySelectionId(BAG_CHROME_OVERLAY_IDS.panel),
  "itemGrid",
  "detailPanel",
  overlaySelectionId(BAG_CHROME_OVERLAY_IDS.eyebrow),
  overlaySelectionId(BAG_CHROME_OVERLAY_IDS.title),
  overlaySelectionId(BAG_CHROME_OVERLAY_IDS.accentLine),
  overlaySelectionId(BAG_CHROME_OVERLAY_IDS.mode),
  overlaySelectionId(BAG_CHROME_OVERLAY_IDS.close),
  overlaySelectionId(BAG_CHROME_OVERLAY_IDS.craft),
] as const;

/**
 * @param overlays - 当前图层
 * @returns 含自定义图层补齐的默认 layerOrder
 */
export function buildDefaultBackpackLayerOrder(
  overlays: readonly UiOverlayElement[] | undefined,
): string[] {
  return buildDefaultLayerOrder(
    BAG_FIXED_LAYER_IDS,
    overlays,
    BAG_DEFAULT_LAYER_ORDER,
  );
}

/**
 * @param id - 图层 id
 * @returns 是否为背包 chrome 组件
 */
export function isBackpackChromeOverlayId(id: string): boolean {
  return (Object.values(BAG_CHROME_OVERLAY_IDS) as string[]).includes(id);
}

/** 默认参考设计宽度（设计像素） */
const DEFAULT_REF_W = 1920;

/** 默认参考设计高度（设计像素） */
const DEFAULT_REF_H = 1080;

/** v1 默认水平内边距 */
const DEFAULT_PAGE_PADDING_X = 48;

/** v1 默认垂直内边距 */
const DEFAULT_PAGE_PADDING_Y = 40;

/** v1 默认详情栏宽度占比 */
const DEFAULT_DETAIL_RATIO = 0.36;

/** 默认 Grid 槽位最小边长 */
const DEFAULT_GRID_CELL_MIN = 100;

/** 默认详情大图高度 */
const DEFAULT_HERO_HEIGHT = 280;

/** 默认详情区内边距 */
const DEFAULT_DETAIL_PADDING = 24;

/** 默认合成按钮相对详情底边的竖直偏移 */
const DEFAULT_CRAFT_OFFSET_Y = 0;

/** 面板内顶栏高度（容纳 INVENTORY / 标题 / 模式链，网格在其下） */
const DEFAULT_HEADER_H = 128;

/** 面板内容区内边距 */
const DEFAULT_INNER_PAD = 28;

/** 网格与详情列间距 */
const DEFAULT_COL_GAP = 24;

/** 强调色默认值 */
const DEFAULT_ACCENT = "#64e0d0";

/**
 * 遮罩默认样式（贴近现网 bgPage）。
 */
const DEFAULT_BACKDROP_STYLE: UiBoxStyle = {
  background: "#05080c",
  opacity: 1,
};

/**
 * 主面板底板默认样式（贴近现网 panel）。
 */
const DEFAULT_PANEL_STYLE: UiBoxStyle = {
  background: "rgba(14, 18, 24, 0.92)",
  borderColor: "rgba(255, 255, 255, 0.08)",
  borderWidth: 1,
  borderRadius: 18,
  shadow: 0.35,
};

/**
 * 物品网格默认样式。
 */
const DEFAULT_GRID_STYLE: UiBoxStyle = {
  background: "rgba(10, 14, 20, 0.55)",
  borderColor: "rgba(255, 255, 255, 0.08)",
  borderWidth: 1,
  borderRadius: 0,
};

/**
 * 格子常态（未选中）默认样式。
 */
const DEFAULT_GRID_CELL_STYLE: UiBoxStyle = {
  background: "rgba(20, 28, 36, 0.9)",
  borderColor: "rgba(255, 255, 255, 0.08)",
  borderWidth: 1,
  borderRadius: 12,
};

/**
 * 选中槽位默认样式（背景由 accent 派生，此处给中性边框）。
 */
const DEFAULT_GRID_SELECTED_STYLE: UiBoxStyle = {
  borderColor: DEFAULT_ACCENT,
  borderWidth: 1,
  borderRadius: 12,
  background: `${DEFAULT_ACCENT}22`,
};

/** 格内名称默认文字样式 */
const DEFAULT_GRID_CELL_LABEL_STYLE: UiTextStyle = {
  color: "#f2f5f7",
  fontSize: 18,
  fontWeight: 650,
};

/** 格内物品图片边长默认值（设计像素） */
const DEFAULT_GRID_ICON_MAX_SIZE = 48;

/**
 * 详情面板默认样式。
 */
const DEFAULT_DETAIL_STYLE: UiBoxStyle = {
  background: "transparent",
  borderColor: "rgba(255, 255, 255, 0.08)",
  borderWidth: 0,
  borderRadius: 0,
};

/** 详情大图框默认样式（对齐现网渐变预览底） */
const DEFAULT_DETAIL_HERO_STYLE: UiBoxStyle = {
  background: `linear-gradient(145deg, ${DEFAULT_ACCENT}33 0%, #0d1a28 55%, #0a1220 100%)`,
  borderColor: "rgba(255, 255, 255, 0.08)",
  borderWidth: 1,
  borderRadius: 14,
};

/** 详情标题默认文案样式 */
const DEFAULT_DETAIL_TITLE_STYLE: UiTextStyle = {
  color: "#f2f5f7",
  fontSize: 28,
  fontWeight: 750,
};

/** 详情副文案（数量 / 可合成）默认样式 */
const DEFAULT_DETAIL_META_STYLE: UiTextStyle = {
  color: DEFAULT_ACCENT,
  fontSize: 20,
  fontWeight: 600,
};

/** 详情描述默认文案样式 */
const DEFAULT_DETAIL_DESCRIPTION_STYLE: UiTextStyle = {
  color: "rgba(220, 230, 235, 0.82)",
  fontSize: 23,
  fontWeight: 400,
};

/** 物品网格空态（道具模式）默认文案样式 */
const DEFAULT_GRID_EMPTY_STYLE: UiTextStyle = {
  color: "rgba(200, 210, 220, 0.55)",
  fontSize: 23,
  fontWeight: 400,
  label: "背包是空的",
};

/** 物品网格空态（合成模式）默认文案样式 */
const DEFAULT_GRID_EMPTY_CRAFT_STYLE: UiTextStyle = {
  color: "rgba(200, 210, 220, 0.55)",
  fontSize: 23,
  fontWeight: 400,
  label: "暂无配方",
};

/** 详情空态默认文案样式（道具模式） */
const DEFAULT_DETAIL_EMPTY_STYLE: UiTextStyle = {
  color: "rgba(200, 210, 220, 0.55)",
  fontSize: 23,
  fontWeight: 400,
  label: "选择物品以查看详情",
};

/** 详情空态默认文案样式（合成模式） */
const DEFAULT_DETAIL_EMPTY_CRAFT_STYLE: UiTextStyle = {
  color: "rgba(200, 210, 220, 0.55)",
  fontSize: 23,
  fontWeight: 400,
  label: "选择配方以查看详情",
};

/** 详情「原料」小标题默认样式 */
const DEFAULT_DETAIL_INGREDIENTS_LABEL_STYLE: UiTextStyle = {
  color: "rgba(220, 230, 235, 0.82)",
  fontSize: 26,
  fontWeight: 600,
  label: "原料",
};

/** 详情原料列表默认样式 */
const DEFAULT_DETAIL_INGREDIENTS_STYLE: UiTextStyle = {
  color: "rgba(200, 210, 220, 0.55)",
  fontSize: 23,
  fontWeight: 400,
};

/**
 * 关闭按钮默认样式。
 */
const DEFAULT_CLOSE_STYLE: UiBoxStyle & UiTextStyle = {
  background: "rgba(255, 255, 255, 0.06)",
  borderColor: "rgba(255, 255, 255, 0.12)",
  borderWidth: 1,
  borderRadius: 10,
  color: "#f2f5f7",
  fontSize: 18,
  fontWeight: 600,
  // 关闭钮用 props.icon（xmark），勿再写「×」以免双叉
  label: "",
};

/**
 * 合成确认按钮默认样式。
 */
const DEFAULT_CRAFT_STYLE: UiBoxStyle & UiTextStyle = {
  background: `${DEFAULT_ACCENT}33`,
  borderColor: DEFAULT_ACCENT,
  borderWidth: 1,
  borderRadius: 10,
  color: "#f2f5f7",
  fontSize: 23,
  fontWeight: 650,
  label: "合成",
};

/**
 * 标题区 eyebrow 默认文案样式。
 */
const DEFAULT_EYEBROW: UiTextStyle = {
  color: DEFAULT_ACCENT,
  fontSize: 24,
  fontWeight: 700,
  label: "INVENTORY",
};

/**
 * 标题区主标题默认文案样式。
 */
const DEFAULT_TITLE: UiTextStyle = {
  color: "#f2f5f7",
  fontSize: 28,
  fontWeight: 700,
  label: "道具",
};

/**
 * 标题区模式切换链默认文案样式。
 */
const DEFAULT_MODE_LINK: UiTextStyle = {
  color: "rgba(220, 230, 235, 0.82)",
  fontSize: 24,
  fontWeight: 600,
  label: "合成",
};

/**
 * 将未知值读为有限数，非法时回退 fallback。
 *
 * @param value - 原始输入
 * @param fallback - 非法时的默认值
 * @returns 有限数
 */
function readFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

/**
 * 将数值钳制到 [min, max]；非法时回退 fallback。
 *
 * @param value - 原始数
 * @param fallback - 回退
 * @param min - 下限
 * @param max - 上限
 * @returns 钳制后的有限数
 */
function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = readFiniteNumber(value, fallback);

  return Math.min(max, Math.max(min, n));
}

/**
 * 深拷贝 UiRect（仅复制已有字段）。
 *
 * @param rect - 源矩形
 * @returns 独立副本
 */
function cloneRect(rect: UiRect): UiRect {
  const next: UiRect = { x: rect.x, y: rect.y };

  if (rect.w !== undefined) {
    next.w = rect.w;
  }

  if (rect.h !== undefined) {
    next.h = rect.h;
  }

  return next;
}

/**
 * 深拷贝盒样式。
 *
 * @param style - 源样式
 * @returns 独立副本
 */
function cloneBoxStyle(style: UiBoxStyle): UiBoxStyle {
  return { ...style };
}

/**
 * 深拷贝文本样式。
 *
 * @param style - 源样式
 * @returns 独立副本
 */
function cloneTextStyle(style: UiTextStyle): UiTextStyle {
  return { ...style };
}

/**
 * 深拷贝盒样式 + 文本样式交叉类型。
 *
 * @param style - 源样式
 * @returns 独立副本
 */
function cloneBoxAndTextStyle(
  style: UiBoxStyle & UiTextStyle,
): UiBoxStyle & UiTextStyle {
  return { ...style };
}

/**
 * 规范化盒样式 + 文本样式。
 *
 * @param raw - 原始对象或部分字段
 * @param fallback - 缺省/非法字段回退
 * @returns 规范化后的交叉类型
 */
function normalizeBoxAndTextStyle(
  raw: unknown,
  fallback: UiBoxStyle & UiTextStyle,
): UiBoxStyle & UiTextStyle {
  const source =
    raw !== null && typeof raw === "object"
      ? (raw as Partial<UiBoxStyle & UiTextStyle>)
      : undefined;

  return {
    ...normalizeUiBoxStyle(source, fallback),
    ...normalizeUiTextStyle(source, fallback),
  };
}

/**
 * 从边距 / 详情占比计算默认节点几何（对齐全屏背包设计稿）。
 *
 * 布局约定（设计分辨率绝对坐标）：
 * - `panelChrome`：舞台内主面板外框
 * - `titleBlock` / `closeButton`：**在面板顶栏内**（不再叠到网格上或落到舞台外）
 * - `itemGrid` / `detailPanel`：顶栏下方左右分栏，中间留列间距
 *
 * @param padX - 面板相对舞台的水平外边距
 * @param padY - 面板相对舞台的垂直外边距
 * @param detailRatio - 详情栏占内容区宽度的比例（不含列间距）
 * @param refW - 参考设计宽度
 * @param refH - 参考设计高度
 * @returns panel / grid / detail / title / close 的绝对 rect
 *
 * @example
 * ```ts
 * const g = computeV1Geometry(48, 40, 0.36, 1920, 1080);
 * // g.panel.w === 1824
 * // g.itemGrid.y > g.titleBlock.y  （网格在标题下方）
 * ```
 *
 * @remarks
 * 不抛异常；非法尺寸由调用方传入的有限正数保证。
 */
function computeV1Geometry(
  padX: number,
  padY: number,
  detailRatio: number,
  refW: number,
  refH: number,
): {
  panel: Required<UiRect>;
  itemGrid: Required<UiRect>;
  detailPanel: Required<UiRect>;
  titleBlock: Required<UiRect>;
  closeButton: Required<UiRect>;
} {
  const panel = {
    x: padX,
    y: padY,
    w: Math.max(1, refW - padX * 2),
    h: Math.max(1, refH - padY * 2),
  };

  const innerPad = DEFAULT_INNER_PAD;
  const headerH = Math.min(DEFAULT_HEADER_H, Math.max(72, panel.h * 0.18));
  const colGap = DEFAULT_COL_GAP;
  const closeSize = 44;

  const titleBlock: Required<UiRect> = {
    x: panel.x + innerPad,
    y: panel.y + 18,
    w: Math.max(120, panel.w - innerPad * 2 - closeSize - 16),
    h: Math.max(56, headerH - 28),
  };

  const closeButton: Required<UiRect> = {
    x: panel.x + panel.w - innerPad - closeSize,
    y: panel.y + 22,
    w: closeSize,
    h: closeSize,
  };

  const contentX = panel.x + innerPad;
  const contentY = panel.y + headerH;
  const contentW = Math.max(1, panel.w - innerPad * 2);
  const contentH = Math.max(1, panel.h - headerH - innerPad);

  const usableW = Math.max(1, contentW - colGap);
  const detailW = Math.max(
    160,
    Math.min(usableW - 160, Math.round(usableW * detailRatio)),
  );
  const gridW = Math.max(160, usableW - detailW);

  return {
    panel,
    titleBlock,
    closeButton,
    itemGrid: {
      x: contentX,
      y: contentY,
      w: gridW,
      h: contentH,
    },
    detailPanel: {
      x: contentX + gridW + colGap,
      y: contentY,
      w: detailW,
      h: contentH,
    },
  };
}

/**
 * 深拷贝完整 nodes 表。
 *
 * @param nodes - 源 nodes
 * @returns 独立副本
 */
function cloneNodes(
  nodes: BackpackScreenConfig["nodes"],
): BackpackScreenConfig["nodes"] {
  return {
    backdrop: { style: cloneBoxStyle(nodes.backdrop.style) },
    panelChrome: {
      rect: cloneRect(nodes.panelChrome.rect),
      style: cloneBoxStyle(nodes.panelChrome.style),
    },
    titleBlock: {
      rect: cloneRect(nodes.titleBlock.rect),
      eyebrow: nodes.titleBlock.eyebrow
        ? cloneTextStyle(nodes.titleBlock.eyebrow)
        : undefined,
      title: nodes.titleBlock.title
        ? cloneTextStyle(nodes.titleBlock.title)
        : undefined,
      modeLink: nodes.titleBlock.modeLink
        ? cloneTextStyle(nodes.titleBlock.modeLink)
        : undefined,
    },
    closeButton: {
      rect: cloneRect(nodes.closeButton.rect),
      style: cloneBoxAndTextStyle(nodes.closeButton.style),
      ...cloneUiButtonSkin(nodes.closeButton),
    },
    itemGrid: {
      rect: cloneRect(nodes.itemGrid.rect),
      cellMin: nodes.itemGrid.cellMin,
      style: cloneBoxStyle(nodes.itemGrid.style),
      cellStyle: nodes.itemGrid.cellStyle
        ? cloneBoxStyle(nodes.itemGrid.cellStyle)
        : undefined,
      selectedStyle: nodes.itemGrid.selectedStyle
        ? cloneBoxStyle(nodes.itemGrid.selectedStyle)
        : undefined,
      cellLabelStyle: nodes.itemGrid.cellLabelStyle
        ? cloneTextStyle(nodes.itemGrid.cellLabelStyle)
        : undefined,
      iconMaxSize: nodes.itemGrid.iconMaxSize,
      emptyStyle: nodes.itemGrid.emptyStyle
        ? cloneTextStyle(nodes.itemGrid.emptyStyle)
        : undefined,
      emptyCraftStyle: nodes.itemGrid.emptyCraftStyle
        ? cloneTextStyle(nodes.itemGrid.emptyCraftStyle)
        : undefined,
    },
    detailPanel: {
      rect: cloneRect(nodes.detailPanel.rect),
      heroHeight: nodes.detailPanel.heroHeight,
      padding: nodes.detailPanel.padding,
      style: cloneBoxStyle(nodes.detailPanel.style),
      heroStyle: nodes.detailPanel.heroStyle
        ? cloneBoxStyle(nodes.detailPanel.heroStyle)
        : undefined,
      titleStyle: nodes.detailPanel.titleStyle
        ? cloneTextStyle(nodes.detailPanel.titleStyle)
        : undefined,
      metaStyle: nodes.detailPanel.metaStyle
        ? cloneTextStyle(nodes.detailPanel.metaStyle)
        : undefined,
      descriptionStyle: nodes.detailPanel.descriptionStyle
        ? cloneTextStyle(nodes.detailPanel.descriptionStyle)
        : undefined,
      emptyStyle: nodes.detailPanel.emptyStyle
        ? cloneTextStyle(nodes.detailPanel.emptyStyle)
        : undefined,
      emptyCraftStyle: nodes.detailPanel.emptyCraftStyle
        ? cloneTextStyle(nodes.detailPanel.emptyCraftStyle)
        : undefined,
      ingredientsLabelStyle: nodes.detailPanel.ingredientsLabelStyle
        ? cloneTextStyle(nodes.detailPanel.ingredientsLabelStyle)
        : undefined,
      ingredientsStyle: nodes.detailPanel.ingredientsStyle
        ? cloneTextStyle(nodes.detailPanel.ingredientsStyle)
        : undefined,
    },
    craftButton: {
      offsetY: nodes.craftButton.offsetY,
      w: nodes.craftButton.w,
      h: nodes.craftButton.h,
      style: cloneBoxAndTextStyle(nodes.craftButton.style),
      ...cloneUiButtonSkin(nodes.craftButton),
    },
  };
}

/**
 * 将 UiRect 补全为 Required。
 *
 * @param rect - 源
 * @param fallbackW - 缺省宽
 * @param fallbackH - 缺省高
 */
function asRequiredRect(
  rect: UiRect,
  fallbackW: number,
  fallbackH: number,
): Required<UiRect> {
  return {
    x: typeof rect.x === "number" ? rect.x : 0,
    y: typeof rect.y === "number" ? rect.y : 0,
    w: typeof rect.w === "number" && rect.w > 0 ? rect.w : fallbackW,
    h: typeof rect.h === "number" && rect.h > 0 ? rect.h : fallbackH,
  };
}

/**
 * 从遗留 nodes chrome 几何生成组件化 overlays（遮罩/主面板/标题/关闭/模式/合成）。
 *
 * @param nodes - 背包 nodes
 * @param refW - 设计宽
 * @param refH - 设计高
 * @returns chrome overlays
 */
export function buildBackpackChromeOverlays(
  nodes: BackpackScreenConfig["nodes"],
  refW: number,
  refH: number,
): UiOverlayElement[] {
  const panel = asRequiredRect(nodes.panelChrome.rect, refW, refH);
  const title = asRequiredRect(nodes.titleBlock.rect, 420, 96);
  const close = asRequiredRect(nodes.closeButton.rect, 44, 44);
  const detail = asRequiredRect(nodes.detailPanel.rect, 400, 600);
  const pad = Math.max(8, nodes.detailPanel.padding ?? DEFAULT_DETAIL_PADDING);
  const craftW =
    typeof nodes.craftButton.w === "number" && nodes.craftButton.w > 0
      ? nodes.craftButton.w
      : Math.max(48, detail.w - pad * 2);
  const craftH =
    typeof nodes.craftButton.h === "number" && nodes.craftButton.h > 0
      ? nodes.craftButton.h
      : 44;
  const craftX = detail.x + pad;
  const craftY =
    detail.y +
    detail.h -
    pad -
    craftH +
    (nodes.craftButton.offsetY ?? DEFAULT_CRAFT_OFFSET_Y);

  const eyebrow = nodes.titleBlock.eyebrow ?? DEFAULT_EYEBROW;
  const titleStyle = nodes.titleBlock.title ?? DEFAULT_TITLE;
  const modeLink = nodes.titleBlock.modeLink ?? DEFAULT_MODE_LINK;
  const modeLabel =
    typeof modeLink.label === "string" ? modeLink.label.trim() : "合成";
  const craftLabel =
    typeof nodes.craftButton.style.label === "string"
      ? nodes.craftButton.style.label.trim()
      : "合成";
  const modeW = 96;
  const modeX = Math.max(0, close.x - 12 - modeW);

  const emptyProps: UiOverlayElement["props"] = {};

  return [
    {
      id: BAG_CHROME_OVERLAY_IDS.backdrop,
      kind: "mask",
      name: "背景遮罩",
      role: "none",
      rect: { x: 0, y: 0, w: refW, h: refH },
      zIndex: 0,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: { ...nodes.backdrop.style },
      props: { ...emptyProps },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.panel,
      kind: "rect",
      name: "主面板",
      role: "none",
      rect: panel,
      zIndex: 1,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: { ...nodes.panelChrome.style },
      props: { ...emptyProps },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.eyebrow,
      kind: "text",
      name: "眉题",
      role: "none",
      rect: { x: title.x, y: title.y, w: Math.max(80, title.w), h: 22 },
      zIndex: 4,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: {
        color: eyebrow.color,
        fontSize: eyebrow.fontSize,
        fontWeight: eyebrow.fontWeight,
      },
      props: { text: eyebrow.label?.trim() || "INVENTORY" },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.title,
      kind: "text",
      name: "标题",
      role: "none",
      rect: {
        x: title.x,
        y: title.y + 24,
        w: Math.max(80, title.w),
        h: 36,
      },
      zIndex: 5,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: {
        color: titleStyle.color,
        fontSize: titleStyle.fontSize,
        fontWeight: titleStyle.fontWeight,
      },
      props: { text: titleStyle.label?.trim() || "道具" },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.accentLine,
      kind: "rect",
      name: "标题装饰线",
      role: "none",
      rect: { x: title.x, y: title.y + 66, w: 44, h: 3 },
      zIndex: 6,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: {
        background: DEFAULT_ACCENT,
        borderRadius: 2,
        borderWidth: 0,
      },
      props: { ...emptyProps },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.mode,
      kind: "button",
      name: "模式切换",
      role: "toggleMode",
      rect: { x: modeX, y: close.y, w: modeW, h: close.h },
      zIndex: 7,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss:
        "background: transparent !important; border: none !important; text-decoration: underline; text-underline-offset: 4px;",
      style: {
        background: "transparent",
        borderWidth: 0,
        color: modeLink.color ?? DEFAULT_ACCENT,
        fontSize: modeLink.fontSize ?? 13,
        fontWeight: modeLink.fontWeight ?? 600,
        label: modeLabel,
      },
      props: {
        text: modeLabel,
        icon: "arrows-rotate",
      },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.close,
      kind: "button",
      name: "关闭按钮",
      role: "closeBag",
      rect: close,
      zIndex: 8,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: { ...nodes.closeButton.style, label: "" },
      skin: cloneUiButtonSkin(nodes.closeButton),
      props: {
        text: "",
        icon: "xmark",
      },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.craft,
      kind: "button",
      name: "合成按钮",
      role: "craft",
      rect: {
        x: craftX,
        y: craftY,
        w: craftW,
        h: craftH,
      },
      zIndex: 9,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: { ...nodes.craftButton.style, label: craftLabel },
      skin: cloneUiButtonSkin(nodes.craftButton),
      props: {
        text: craftLabel,
        icon: "flask",
      },
    },
  ];
}

/**
 * @param value - 文案
 * @returns 是否为旧版关闭钮字符叉
 */
function isLegacyCloseGlyph(value: string): boolean {
  return value === "×" || value === "✕" || value === "x" || value === "X";
}

/**
 * 补齐缺失的 chrome overlays（按稳定 id）；已存在的保留用户编辑。
 *
 * @param overlays - 当前图层
 * @param nodes - 用于生成缺省 chrome
 * @param refW - 设计宽
 * @param refH - 设计高
 */
export function ensureBackpackChromeOverlays(
  overlays: readonly UiOverlayElement[],
  nodes: BackpackScreenConfig["nodes"],
  refW: number,
  refH: number,
): UiOverlayElement[] {
  const seeds = buildBackpackChromeOverlays(nodes, refW, refH);
  const byId = new Map(overlays.map((el) => [el.id, el]));
  const out: UiOverlayElement[] = [];

  for (const seed of seeds) {
    const existing = byId.get(seed.id);

    if (existing) {
      const cloned = cloneUiOverlayElement(existing);

      // 旧配置补默认图标（关闭 / 合成）
      if (cloned.role === "closeBag" || seed.role === "closeBag") {
        if (!cloned.props.icon) {
          cloned.props = { ...cloned.props, icon: "xmark" };
        }

        // 图标已存在时清掉旧版「×」文案，避免双叉
        if (cloned.props.icon) {
          const text = cloned.props.text?.trim() ?? "";
          const label =
            typeof cloned.style.label === "string"
              ? cloned.style.label.trim()
              : "";

          if (isLegacyCloseGlyph(text)) {
            cloned.props = { ...cloned.props, text: "" };
          }

          if (isLegacyCloseGlyph(label)) {
            cloned.style = { ...cloned.style, label: "" };
          }
        }
      }

      if (
        (cloned.role === "craft" || seed.role === "craft") &&
        !cloned.props.icon
      ) {
        cloned.props = { ...cloned.props, icon: "flask" };
      }

      out.push(cloned);
      byId.delete(seed.id);
    } else {
      out.push(cloneUiOverlayElement(seed));
    }
  }

  for (const el of byId.values()) {
    out.push(cloneUiOverlayElement(el));
  }

  return out;
}

/**
 * 按比例缩放矩形（设计像素；w/h 可选）。
 *
 * @param rect - 源矩形
 * @param sx - 水平缩放
 * @param sy - 竖直缩放
 */
function scaleUiRect(rect: UiRect, sx: number, sy: number): UiRect {
  const next: UiRect = {
    x: Math.round(rect.x * sx),
    y: Math.round(rect.y * sy),
  };

  if (typeof rect.w === "number") {
    next.w = Math.max(1, Math.round(rect.w * sx));
  }

  if (typeof rect.h === "number") {
    next.h = Math.max(1, Math.round(rect.h * sy));
  }

  return next;
}

/**
 * 按比例缩放必含 w/h 的矩形（overlay 用）。
 *
 * @param rect - 源矩形（必含正 w/h）
 * @param sx - 水平缩放
 * @param sy - 竖直缩放
 */
function scaleRequiredUiRect(
  rect: Required<UiRect>,
  sx: number,
  sy: number,
): Required<UiRect> {
  return {
    x: Math.round(rect.x * sx),
    y: Math.round(rect.y * sy),
    w: Math.max(1, Math.round(rect.w * sx)),
    h: Math.max(1, Math.round(rect.h * sy)),
  };
}

/**
 * 将背包布局从一套设计分辨率等比缩放到另一套。
 *
 * @param cfg - 源配置
 * @param fromW - 源设计宽
 * @param fromH - 源设计高
 * @param toW - 目标设计宽
 * @param toH - 目标设计高
 * @returns 新配置（不修改入参）
 */
export function scaleBackpackScreenLayout(
  cfg: BackpackScreenConfig,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): BackpackScreenConfig {
  const fw = Math.max(1, fromW);
  const fh = Math.max(1, fromH);
  const tw = Math.max(1, toW);
  const th = Math.max(1, toH);

  if (fw === tw && fh === th) {
    return cfg;
  }

  const sx = tw / fw;
  const sy = th / fh;
  const nodes = cloneNodes(cfg.nodes);

  nodes.panelChrome.rect = scaleUiRect(nodes.panelChrome.rect, sx, sy);
  nodes.titleBlock.rect = scaleUiRect(nodes.titleBlock.rect, sx, sy);
  nodes.closeButton.rect = scaleUiRect(nodes.closeButton.rect, sx, sy);
  nodes.itemGrid.rect = scaleUiRect(nodes.itemGrid.rect, sx, sy);
  nodes.detailPanel.rect = scaleUiRect(nodes.detailPanel.rect, sx, sy);
  nodes.detailPanel.heroHeight = Math.max(
    1,
    Math.round(nodes.detailPanel.heroHeight * sy),
  );
  nodes.detailPanel.padding = Math.max(
    0,
    Math.round(nodes.detailPanel.padding * Math.min(sx, sy)),
  );
  nodes.itemGrid.cellMin = Math.max(
    1,
    Math.round(nodes.itemGrid.cellMin * Math.min(sx, sy)),
  );

  if (typeof nodes.itemGrid.iconMaxSize === "number") {
    nodes.itemGrid.iconMaxSize = Math.max(
      1,
      Math.round(nodes.itemGrid.iconMaxSize * Math.min(sx, sy)),
    );
  }

  if (typeof nodes.craftButton.w === "number") {
    nodes.craftButton.w = Math.max(1, Math.round(nodes.craftButton.w * sx));
  }

  if (typeof nodes.craftButton.h === "number") {
    nodes.craftButton.h = Math.max(1, Math.round(nodes.craftButton.h * sy));
  }

  const overlays = cloneUiOverlays(cfg.overlays ?? []).map((el) => ({
    ...el,
    rect: scaleRequiredUiRect(el.rect, sx, sy),
  }));

  return {
    ...cfg,
    nodes,
    overlays: syncOverlaysZIndexFromLayerOrder(overlays, cfg.layerOrder ?? []),
    layerOrder: [...(cfg.layerOrder ?? [])],
  };
}

/**
 * 将 1920×1080 默认预设缩放到目标设计尺寸。
 *
 * @param cfg - 基准预设
 * @param refW - 目标宽
 * @param refH - 目标高
 */
function scaleBackpackScreenPreset(
  cfg: BackpackScreenConfig,
  refW: number,
  refH: number,
): BackpackScreenConfig {
  return scaleBackpackScreenLayout(
    cfg,
    DEFAULT_REF_W,
    DEFAULT_REF_H,
    refW,
    refH,
  );
}

/**
 * 统计布局在设计坐标中的右/下边界。
 *
 * @param cfg - 背包配置
 * @returns right / bottom（设计像素）
 */
function measureBackpackExtent(cfg: BackpackScreenConfig): {
  right: number;
  bottom: number;
} {
  let right = 0;
  let bottom = 0;

  const consider = (rect: UiRect | undefined): void => {
    if (!rect) {
      return;
    }

    const w = typeof rect.w === "number" && rect.w > 0 ? rect.w : 0;
    const h = typeof rect.h === "number" && rect.h > 0 ? rect.h : 0;
    right = Math.max(right, rect.x + w);
    bottom = Math.max(bottom, rect.y + h);
  };

  consider(cfg.nodes.panelChrome.rect);
  consider(cfg.nodes.titleBlock.rect);
  consider(cfg.nodes.closeButton.rect);
  consider(cfg.nodes.itemGrid.rect);
  consider(cfg.nodes.detailPanel.rect);

  const craft = cfg.nodes.craftButton;
  const craftW = typeof craft.w === "number" && craft.w > 0 ? craft.w : 0;
  const craftH = typeof craft.h === "number" && craft.h > 0 ? craft.h : 0;
  const detail = cfg.nodes.detailPanel.rect;
  const detailBottom =
    detail.y +
    (typeof detail.h === "number" && detail.h > 0 ? detail.h : 0);
  const craftOffsetY =
    typeof craft.offsetY === "number" ? craft.offsetY : 0;

  if (craftW > 0 || craftH > 0) {
    right = Math.max(right, detail.x + craftW);
    bottom = Math.max(bottom, detailBottom + craftOffsetY + craftH);
  }

  for (const el of cfg.overlays ?? []) {
    consider(el.rect);
  }

  return { right, bottom };
}

/**
 * 若布局明显超出当前设计画幅（常见：存盘仍是 1920 预设、画布已是 1280），
 * 则从推断的源分辨率等比缩放到目标设计尺寸。
 *
 * @param cfg - 当前配置
 * @param designW - 当前设计宽
 * @param designH - 当前设计高
 * @returns 适配后的配置；无需缩放时返回原引用
 */
export function adaptBackpackScreenToDesign(
  cfg: BackpackScreenConfig,
  designW: number,
  designH: number,
): BackpackScreenConfig {
  const dw = Math.max(1, designW);
  const dh = Math.max(1, designH);
  const { right, bottom } = measureBackpackExtent(cfg);
  /** 允许数像素贴边溢出，避免误缩放作者刻意的微调 */
  const slack = 8;

  if (right <= dw + slack && bottom <= dh + slack) {
    return cfg;
  }

  /**
   * 外接边落在默认 1920×1080 画幅内时按该参照缩放；
   * 否则按内容外接尺寸缩放（兼容更大自定义画幅旧档）。
   */
  const looksLikeDefaultW =
    right >= DEFAULT_REF_W * 0.85 && right <= DEFAULT_REF_W + slack;
  const looksLikeDefaultH =
    bottom >= DEFAULT_REF_H * 0.85 && bottom <= DEFAULT_REF_H + slack;

  const fromW = looksLikeDefaultW ? DEFAULT_REF_W : Math.max(right, dw);
  const fromH = looksLikeDefaultH ? DEFAULT_REF_H : Math.max(bottom, dh);

  return scaleBackpackScreenLayout(cfg, fromW, fromH, dw, dh);
}

/**
 * 返回 v2 约定的全屏背包默认配置（作者预设，基准 1920×1080；其它设计尺寸等比缩放）。
 *
 * @param refW - 参考设计宽度，默认 1920
 * @param refH - 参考设计高度，默认 1080
 * @returns 默认 BackpackScreenConfig（version: 2）
 *
 * @example
 * ```ts
 * const cfg = defaultBackpackScreen();
 * // cfg.nodes.panelChrome.rect.w === 1824
 * ```
 */
export function defaultBackpackScreen(
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): BackpackScreenConfig {
  const nodes: BackpackScreenConfig["nodes"] = {
    backdrop: { style: { ...DEFAULT_BACKDROP_STYLE } },
    panelChrome: {
      rect: { x: 48, y: 40, w: 1824, h: 1000 },
      style: { ...DEFAULT_PANEL_STYLE },
    },
    titleBlock: {
      rect: { x: 76, y: 58, w: 1708, h: 100 },
      eyebrow: { ...DEFAULT_EYEBROW },
      title: { ...DEFAULT_TITLE },
      modeLink: { ...DEFAULT_MODE_LINK },
    },
    closeButton: {
      rect: { x: 1800, y: 62, w: 44, h: 44 },
      style: { ...DEFAULT_CLOSE_STYLE, label: "×" },
    },
    itemGrid: {
      rect: { x: 76, y: 168, w: 1116, h: 844 },
      cellMin: DEFAULT_GRID_CELL_MIN,
      style: { ...DEFAULT_GRID_STYLE },
      cellStyle: { ...DEFAULT_GRID_CELL_STYLE },
      selectedStyle: { ...DEFAULT_GRID_SELECTED_STYLE },
      cellLabelStyle: { ...DEFAULT_GRID_CELL_LABEL_STYLE },
      iconMaxSize: DEFAULT_GRID_ICON_MAX_SIZE,
      emptyStyle: { ...DEFAULT_GRID_EMPTY_STYLE },
      emptyCraftStyle: { ...DEFAULT_GRID_EMPTY_CRAFT_STYLE },
    },
    detailPanel: {
      rect: { x: 1216, y: 168, w: 628, h: 844 },
      heroHeight: DEFAULT_HERO_HEIGHT,
      padding: DEFAULT_DETAIL_PADDING,
      style: { ...DEFAULT_DETAIL_STYLE },
      heroStyle: { ...DEFAULT_DETAIL_HERO_STYLE },
      titleStyle: { ...DEFAULT_DETAIL_TITLE_STYLE },
      metaStyle: { ...DEFAULT_DETAIL_META_STYLE },
      descriptionStyle: { ...DEFAULT_DETAIL_DESCRIPTION_STYLE },
      emptyStyle: { ...DEFAULT_DETAIL_EMPTY_STYLE },
      emptyCraftStyle: { ...DEFAULT_DETAIL_EMPTY_CRAFT_STYLE },
      ingredientsLabelStyle: { ...DEFAULT_DETAIL_INGREDIENTS_LABEL_STYLE },
      ingredientsStyle: { ...DEFAULT_DETAIL_INGREDIENTS_STYLE },
    },
    craftButton: {
      offsetY: DEFAULT_CRAFT_OFFSET_Y,
      w: 580,
      h: 69,
      style: { ...DEFAULT_CRAFT_STYLE },
    },
  };

  const overlayProps: UiOverlayElement["props"] = {
    thickness: 2,
    lineStyle: "solid",
    initialIndex: 0,
    initialOn: true,
    initialValue: 60,
    showValue: true,
    maxLength: 0,
    tabGap: 8,
  };

  const overlays: UiOverlayElement[] = [
    {
      id: BAG_CHROME_OVERLAY_IDS.backdrop,
      kind: "mask",
      name: "背景遮罩",
      role: "none",
      rect: { x: 0, y: 0, w: DEFAULT_REF_W, h: DEFAULT_REF_H },
      zIndex: 0,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: {
        background: "#05080C33",
        opacity: 1,
        color: "#f2f5f7",
        fontSize: 16,
      },
      props: { ...overlayProps },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.panel,
      kind: "rect",
      name: "主面板",
      role: "none",
      rect: { x: 47, y: 40, w: 1824, h: 1000 },
      zIndex: 1,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: {
        ...DEFAULT_PANEL_STYLE,
        color: "#f2f5f7",
        fontSize: 16,
      },
      props: { ...overlayProps },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.eyebrow,
      kind: "text",
      name: "眉题",
      role: "none",
      rect: { x: 76, y: 58, w: 217, h: 35 },
      zIndex: 4,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: {
        color: DEFAULT_ACCENT,
        fontSize: 24,
        fontWeight: 700,
      },
      props: { ...overlayProps, text: "INVENTORY" },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.title,
      kind: "text",
      name: "标题",
      role: "none",
      rect: { x: 76, y: 94, w: 244, h: 36 },
      zIndex: 5,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: {
        color: "#f2f5f7",
        fontSize: 28,
        fontWeight: 700,
      },
      props: { ...overlayProps, text: "道具" },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.accentLine,
      kind: "rect",
      name: "标题装饰线",
      role: "none",
      rect: { x: 76, y: 146, w: 80, h: 3 },
      zIndex: 6,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: {
        background: DEFAULT_ACCENT,
        borderWidth: 0,
        borderRadius: 2,
        color: "#f2f5f7",
        fontSize: 16,
      },
      props: { ...overlayProps },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.mode,
      kind: "button",
      name: "模式切换",
      role: "toggleMode",
      rect: { x: 1616, y: 63, w: 159, h: 56 },
      zIndex: 7,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: {
        background: "transparent",
        borderWidth: 0,
        color: "rgba(220, 230, 235, 0.82)",
        fontSize: 24,
        fontWeight: 600,
        label: "合成",
      },
      props: { ...overlayProps, text: "合成", icon: "arrows-rotate" },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.close,
      kind: "button",
      name: "关闭按钮",
      role: "closeBag",
      rect: { x: 1787, y: 63, w: 56, h: 56 },
      zIndex: 8,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: { ...DEFAULT_CLOSE_STYLE },
      props: { ...overlayProps, text: "", icon: "xmark" },
    },
    {
      id: BAG_CHROME_OVERLAY_IDS.craft,
      kind: "button",
      name: "合成按钮",
      role: "craft",
      rect: { x: 1240, y: 919, w: 580, h: 69 },
      zIndex: 9,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: { ...DEFAULT_CRAFT_STYLE },
      props: { ...overlayProps, text: "合成", icon: "flask" },
    },
  ];

  const layerOrder = buildDefaultBackpackLayerOrder(overlays);
  const base: BackpackScreenConfig = {
    version: 2,
    accent: DEFAULT_ACCENT,
    overlays: syncOverlaysZIndexFromLayerOrder(overlays, layerOrder),
    layerOrder,
    nodes,
  };

  if (refW === DEFAULT_REF_W && refH === DEFAULT_REF_H) {
    return base;
  }

  return scaleBackpackScreenPreset(base, refW, refH);
}

/**
 * 将 v1 扁平字段迁移为 v2 nodes（内部）。
 *
 * 几何公式见 plan Task 3（pad → panel → grid/detail/title/close）。
 *
 * @param flat - 原始对象（含 pagePaddingX 等）
 * @param refW - 参考设计宽度
 * @param refH - 参考设计高度
 * @returns 迁移后的 BackpackScreenConfig
 */
function migrateBackpackScreenV1(
  flat: Record<string, unknown>,
  refW: number,
  refH: number,
): BackpackScreenConfig {
  const padX = readFiniteNumber(flat.pagePaddingX, DEFAULT_PAGE_PADDING_X);
  const padY = readFiniteNumber(flat.pagePaddingY, DEFAULT_PAGE_PADDING_Y);
  const detailRatio = clampNumber(
    flat.detailRatio,
    DEFAULT_DETAIL_RATIO,
    0.25,
    0.5,
  );
  const cellMin = clampNumber(
    flat.gridCellMin,
    DEFAULT_GRID_CELL_MIN,
    64,
    180,
  );
  const heroHeight = clampNumber(
    flat.heroHeight,
    DEFAULT_HERO_HEIGHT,
    120,
    420,
  );
  const accent =
    typeof flat.accent === "string" && flat.accent.trim().length > 0
      ? flat.accent.trim()
      : DEFAULT_ACCENT;

  const defaults = defaultBackpackScreen(refW, refH);
  const geometry = computeV1Geometry(padX, padY, detailRatio, refW, refH);

  const nodes: BackpackScreenConfig["nodes"] = {
    ...cloneNodes(defaults.nodes),
    panelChrome: {
      rect: { ...geometry.panel },
      style: cloneBoxStyle(defaults.nodes.panelChrome.style),
    },
    titleBlock: {
      ...cloneNodes(defaults.nodes).titleBlock,
      rect: { ...geometry.titleBlock },
    },
    closeButton: {
      rect: { ...geometry.closeButton },
      style: cloneBoxAndTextStyle(defaults.nodes.closeButton.style),
    },
    itemGrid: {
      ...cloneNodes(defaults.nodes).itemGrid,
      rect: { ...geometry.itemGrid },
      cellMin,
      style: cloneBoxStyle(defaults.nodes.itemGrid.style),
      selectedStyle: defaults.nodes.itemGrid.selectedStyle
        ? cloneBoxStyle(defaults.nodes.itemGrid.selectedStyle)
        : undefined,
    },
    detailPanel: {
      ...cloneNodes(defaults.nodes).detailPanel,
      rect: { ...geometry.detailPanel },
      heroHeight,
      padding: defaults.nodes.detailPanel.padding,
    },
  };

  const overlays = buildBackpackChromeOverlays(nodes, refW, refH);
  const layerOrder = buildDefaultBackpackLayerOrder(overlays);

  return {
    version: 2,
    accent,
    overlays: syncOverlaysZIndexFromLayerOrder(overlays, layerOrder),
    layerOrder,
    nodes,
  };
}

/**
 * 规范化 backdrop 节点。
 *
 * @param raw - 原始节点
 * @param fallback - 默认节点
 * @returns 规范化节点
 */
function normalizeBackdrop(
  raw: unknown,
  fallback: BackpackScreenConfig["nodes"]["backdrop"],
): BackpackScreenConfig["nodes"]["backdrop"] {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return { style: cloneBoxStyle(fallback.style) };
  }

  const obj = raw as Record<string, unknown>;

  return {
    style: normalizeUiBoxStyle(
      obj.style as Partial<UiBoxStyle> | undefined,
      fallback.style,
    ),
  };
}

/**
 * 规范化带 rect + style 的面板类节点（panelChrome）。
 *
 * @param raw - 原始节点
 * @param fallback - 默认节点
 * @returns 规范化节点
 */
function normalizePanelChrome(
  raw: unknown,
  fallback: BackpackScreenConfig["nodes"]["panelChrome"],
): BackpackScreenConfig["nodes"]["panelChrome"] {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {
      rect: cloneRect(fallback.rect),
      style: cloneBoxStyle(fallback.style),
    };
  }

  const obj = raw as Record<string, unknown>;

  return {
    rect: normalizeUiRect(
      obj.rect as Partial<UiRect> | undefined,
      fallback.rect,
    ),
    style: normalizeUiBoxStyle(
      obj.style as Partial<UiBoxStyle> | undefined,
      fallback.style,
    ),
  };
}

/**
 * 规范化 titleBlock 节点。
 *
 * @param raw - 原始节点
 * @param fallback - 默认节点
 * @returns 规范化节点
 */
function normalizeTitleBlock(
  raw: unknown,
  fallback: BackpackScreenConfig["nodes"]["titleBlock"],
): BackpackScreenConfig["nodes"]["titleBlock"] {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {
      rect: cloneRect(fallback.rect),
      eyebrow: fallback.eyebrow ? cloneTextStyle(fallback.eyebrow) : undefined,
      title: fallback.title ? cloneTextStyle(fallback.title) : undefined,
      modeLink: fallback.modeLink ? cloneTextStyle(fallback.modeLink) : undefined,
    };
  }

  const obj = raw as Record<string, unknown>;

  return {
    rect: normalizeUiRect(
      obj.rect as Partial<UiRect> | undefined,
      fallback.rect,
    ),
    eyebrow: normalizeUiTextStyle(
      obj.eyebrow as Partial<UiTextStyle> | undefined,
      fallback.eyebrow ?? DEFAULT_EYEBROW,
    ),
    title: normalizeUiTextStyle(
      obj.title as Partial<UiTextStyle> | undefined,
      fallback.title ?? DEFAULT_TITLE,
    ),
    modeLink: normalizeUiTextStyle(
      obj.modeLink as Partial<UiTextStyle> | undefined,
      fallback.modeLink ?? DEFAULT_MODE_LINK,
    ),
  };
}

/**
 * 规范化 closeButton 节点。
 *
 * @param raw - 原始节点
 * @param fallback - 默认节点
 * @returns 规范化节点
 */
function normalizeCloseButton(
  raw: unknown,
  fallback: BackpackScreenConfig["nodes"]["closeButton"],
): BackpackScreenConfig["nodes"]["closeButton"] {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {
      rect: cloneRect(fallback.rect),
      style: cloneBoxAndTextStyle(fallback.style),
      ...cloneUiButtonSkin(fallback),
    };
  }

  const obj = raw as Record<string, unknown>;

  return {
    rect: normalizeUiRect(
      obj.rect as Partial<UiRect> | undefined,
      fallback.rect,
    ),
    style: normalizeBoxAndTextStyle(obj.style, fallback.style),
    ...normalizeUiButtonSkin(obj),
  };
}

/**
 * 规范化 itemGrid 节点。
 *
 * @param raw - 原始节点
 * @param fallback - 默认节点
 * @returns 规范化节点
 */
function normalizeItemGrid(
  raw: unknown,
  fallback: BackpackScreenConfig["nodes"]["itemGrid"],
): BackpackScreenConfig["nodes"]["itemGrid"] {
  const fallbackCell = fallback.cellStyle ?? DEFAULT_GRID_CELL_STYLE;
  const fallbackLabel =
    fallback.cellLabelStyle ?? DEFAULT_GRID_CELL_LABEL_STYLE;
  const fallbackIconMax =
    typeof fallback.iconMaxSize === "number" && fallback.iconMaxSize > 0
      ? fallback.iconMaxSize
      : DEFAULT_GRID_ICON_MAX_SIZE;
  const fallbackEmpty = fallback.emptyStyle ?? DEFAULT_GRID_EMPTY_STYLE;
  const fallbackEmptyCraft =
    fallback.emptyCraftStyle ?? DEFAULT_GRID_EMPTY_CRAFT_STYLE;

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {
      rect: cloneRect(fallback.rect),
      cellMin: fallback.cellMin,
      style: cloneBoxStyle(fallback.style),
      cellStyle: cloneBoxStyle(fallbackCell),
      selectedStyle: fallback.selectedStyle
        ? cloneBoxStyle(fallback.selectedStyle)
        : undefined,
      cellLabelStyle: cloneTextStyle(fallbackLabel),
      iconMaxSize: fallbackIconMax,
      emptyStyle: cloneTextStyle(fallbackEmpty),
      emptyCraftStyle: cloneTextStyle(fallbackEmptyCraft),
    };
  }

  const obj = raw as Record<string, unknown>;
  const result: BackpackScreenConfig["nodes"]["itemGrid"] = {
    rect: normalizeUiRect(
      obj.rect as Partial<UiRect> | undefined,
      fallback.rect,
    ),
    cellMin: clampNumber(obj.cellMin, fallback.cellMin, 64, 180),
    style: normalizeUiBoxStyle(
      obj.style as Partial<UiBoxStyle> | undefined,
      fallback.style,
    ),
    cellStyle: normalizeUiBoxStyle(
      obj.cellStyle as Partial<UiBoxStyle> | undefined,
      fallbackCell,
    ),
    cellLabelStyle: normalizeUiTextStyle(
      obj.cellLabelStyle as Partial<UiTextStyle> | undefined,
      fallbackLabel,
    ),
    iconMaxSize: clampNumber(
      obj.iconMaxSize,
      fallbackIconMax,
      24,
      160,
    ),
    emptyStyle: normalizeUiTextStyle(
      obj.emptyStyle as Partial<UiTextStyle> | undefined,
      fallbackEmpty,
    ),
    emptyCraftStyle: normalizeUiTextStyle(
      obj.emptyCraftStyle as Partial<UiTextStyle> | undefined,
      fallbackEmptyCraft,
    ),
  };

  if (
    obj.selectedStyle !== undefined &&
    obj.selectedStyle !== null &&
    typeof obj.selectedStyle === "object"
  ) {
    result.selectedStyle = normalizeUiBoxStyle(
      obj.selectedStyle as Partial<UiBoxStyle>,
      fallback.selectedStyle ?? DEFAULT_GRID_SELECTED_STYLE,
    );
  } else if (fallback.selectedStyle) {
    result.selectedStyle = cloneBoxStyle(fallback.selectedStyle);
  }

  return result;
}

/**
 * 规范化 detailPanel 节点。
 *
 * @param raw - 原始节点
 * @param fallback - 默认节点
 * @returns 规范化节点
 */
function normalizeDetailPanel(
  raw: unknown,
  fallback: BackpackScreenConfig["nodes"]["detailPanel"],
): BackpackScreenConfig["nodes"]["detailPanel"] {
  const fallbackHero =
    fallback.heroStyle ?? DEFAULT_DETAIL_HERO_STYLE;
  const fallbackTitle =
    fallback.titleStyle ?? DEFAULT_DETAIL_TITLE_STYLE;
  const fallbackMeta = fallback.metaStyle ?? DEFAULT_DETAIL_META_STYLE;
  const fallbackDescription =
    fallback.descriptionStyle ?? DEFAULT_DETAIL_DESCRIPTION_STYLE;
  const fallbackEmpty = fallback.emptyStyle ?? DEFAULT_DETAIL_EMPTY_STYLE;
  const fallbackEmptyCraft =
    fallback.emptyCraftStyle ?? DEFAULT_DETAIL_EMPTY_CRAFT_STYLE;
  const fallbackIngredientsLabel =
    fallback.ingredientsLabelStyle ?? DEFAULT_DETAIL_INGREDIENTS_LABEL_STYLE;
  const fallbackIngredients =
    fallback.ingredientsStyle ?? DEFAULT_DETAIL_INGREDIENTS_STYLE;

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {
      rect: cloneRect(fallback.rect),
      heroHeight: fallback.heroHeight,
      padding: fallback.padding,
      style: cloneBoxStyle(fallback.style),
      heroStyle: cloneBoxStyle(fallbackHero),
      titleStyle: cloneTextStyle(fallbackTitle),
      metaStyle: cloneTextStyle(fallbackMeta),
      descriptionStyle: cloneTextStyle(fallbackDescription),
      emptyStyle: cloneTextStyle(fallbackEmpty),
      emptyCraftStyle: cloneTextStyle(fallbackEmptyCraft),
      ingredientsLabelStyle: cloneTextStyle(fallbackIngredientsLabel),
      ingredientsStyle: cloneTextStyle(fallbackIngredients),
    };
  }

  const obj = raw as Record<string, unknown>;

  return {
    rect: normalizeUiRect(
      obj.rect as Partial<UiRect> | undefined,
      fallback.rect,
    ),
    heroHeight: clampNumber(obj.heroHeight, fallback.heroHeight, 120, 420),
    padding: clampNumber(obj.padding, fallback.padding, 0, 80),
    style: normalizeUiBoxStyle(
      obj.style as Partial<UiBoxStyle> | undefined,
      fallback.style,
    ),
    heroStyle: normalizeUiBoxStyle(
      obj.heroStyle as Partial<UiBoxStyle> | undefined,
      fallbackHero,
    ),
    titleStyle: normalizeUiTextStyle(
      obj.titleStyle as Partial<UiTextStyle> | undefined,
      fallbackTitle,
    ),
    metaStyle: normalizeUiTextStyle(
      obj.metaStyle as Partial<UiTextStyle> | undefined,
      fallbackMeta,
    ),
    descriptionStyle: normalizeUiTextStyle(
      obj.descriptionStyle as Partial<UiTextStyle> | undefined,
      fallbackDescription,
    ),
    emptyStyle: normalizeUiTextStyle(
      obj.emptyStyle as Partial<UiTextStyle> | undefined,
      fallbackEmpty,
    ),
    emptyCraftStyle: normalizeUiTextStyle(
      obj.emptyCraftStyle as Partial<UiTextStyle> | undefined,
      fallbackEmptyCraft,
    ),
    ingredientsLabelStyle: normalizeUiTextStyle(
      obj.ingredientsLabelStyle as Partial<UiTextStyle> | undefined,
      fallbackIngredientsLabel,
    ),
    ingredientsStyle: normalizeUiTextStyle(
      obj.ingredientsStyle as Partial<UiTextStyle> | undefined,
      fallbackIngredients,
    ),
  };
}

/**
 * 规范化 craftButton 节点。
 *
 * @param raw - 原始节点
 * @param fallback - 默认节点
 * @returns 规范化节点
 */
/**
 * 规范化可选正尺寸（用于 craftButton.w / h）。
 *
 * @param value - 原始值
 * @param fallback - 回退（可为 undefined 表示不写字段）
 * @param min - 最小合法值
 * @returns 正有限数，或 undefined
 */
function normalizeOptionalPositiveSize(
  value: unknown,
  fallback: number | undefined,
  min: number,
): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= min) {
    return value;
  }

  if (
    typeof fallback === "number" &&
    Number.isFinite(fallback) &&
    fallback >= min
  ) {
    return fallback;
  }

  return undefined;
}

function normalizeCraftButton(
  raw: unknown,
  fallback: BackpackScreenConfig["nodes"]["craftButton"],
): BackpackScreenConfig["nodes"]["craftButton"] {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {
      offsetY: fallback.offsetY,
      w: fallback.w,
      h: fallback.h,
      style: cloneBoxAndTextStyle(fallback.style),
      ...cloneUiButtonSkin(fallback),
    };
  }

  const obj = raw as Record<string, unknown>;
  const result: BackpackScreenConfig["nodes"]["craftButton"] = {
    offsetY: clampNumber(
      obj.offsetY,
      fallback.offsetY ?? DEFAULT_CRAFT_OFFSET_Y,
      -400,
      400,
    ),
    style: normalizeBoxAndTextStyle(obj.style, fallback.style),
    ...normalizeUiButtonSkin(obj),
  };

  const w = normalizeOptionalPositiveSize(obj.w, fallback.w, 48);
  const h = normalizeOptionalPositiveSize(
    obj.h,
    fallback.h,
    24,
  );

  if (w !== undefined) {
    result.w = w;
  }

  if (h !== undefined) {
    result.h = h;
  }

  return result;
}

/**
 * 将任意 JSON 输入规范化为 BackpackScreenConfig（version 2）。
 *
 * - `version === 2` 且 `nodes` 为对象：逐字段 normalize，缺节点用 default
 * - 否则视为 v1：按 pad/detailRatio 公式填入默认 nodes
 *
 * @param raw - 原始对象或 undefined
 * @param refW - 参考设计宽度，默认 1920
 * @param refH - 参考设计高度，默认 1080
 * @returns 规范化后的背包布局；非法根回退 defaultBackpackScreen()
 *
 * @example
 * ```ts
 * normalizeBackpackScreen({ pagePaddingX: 48, detailRatio: 0.36 }, 1920, 1080);
 * // → version 2，nodes.panelChrome.rect.w === 1824
 * ```
 */
export function normalizeBackpackScreen(
  raw: unknown,
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): BackpackScreenConfig {
  const defaults = defaultBackpackScreen(refW, refH);

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return defaultBackpackScreen(refW, refH);
  }

  const obj = raw as Record<string, unknown>;

  if (obj.version === 2 && obj.nodes !== null && typeof obj.nodes === "object") {
    const nodes = obj.nodes as Record<string, unknown>;
    const normalizedNodes: BackpackScreenConfig["nodes"] = {
      backdrop: normalizeBackdrop(nodes.backdrop, defaults.nodes.backdrop),
      panelChrome: normalizePanelChrome(
        nodes.panelChrome,
        defaults.nodes.panelChrome,
      ),
      titleBlock: normalizeTitleBlock(
        nodes.titleBlock,
        defaults.nodes.titleBlock,
      ),
      closeButton: normalizeCloseButton(
        nodes.closeButton,
        defaults.nodes.closeButton,
      ),
      itemGrid: normalizeItemGrid(nodes.itemGrid, defaults.nodes.itemGrid),
      detailPanel: normalizeDetailPanel(
        nodes.detailPanel,
        defaults.nodes.detailPanel,
      ),
      craftButton: normalizeCraftButton(
        nodes.craftButton,
        defaults.nodes.craftButton,
      ),
    };

    const overlays = ensureBackpackChromeOverlays(
      normalizeUiOverlays(obj.overlays),
      normalizedNodes,
      refW,
      refH,
    );

    // 旧默认把功能节点排在最前；若仍是该 naive 顺序则升级为新默认
    const legacyDefault = buildDefaultLayerOrder(BAG_FIXED_LAYER_IDS, overlays);
    const rawOrder = Array.isArray(obj.layerOrder) ? obj.layerOrder : undefined;
    const isLegacyDefault =
      !!rawOrder &&
      rawOrder.length === legacyDefault.length &&
      rawOrder.every(
        (id, index) => typeof id === "string" && id === legacyDefault[index],
      );

    const layerOrder = normalizeLayerOrder(
      isLegacyDefault ? undefined : obj.layerOrder,
      BAG_FIXED_LAYER_IDS,
      overlays,
      BAG_DEFAULT_LAYER_ORDER,
    );

    return adaptBackpackScreenToDesign(
      {
        version: 2,
        accent:
          typeof obj.accent === "string" && obj.accent.trim().length > 0
            ? obj.accent.trim()
            : defaults.accent,
        overlays: syncOverlaysZIndexFromLayerOrder(overlays, layerOrder),
        layerOrder,
        nodes: normalizedNodes,
      },
      refW,
      refH,
    );
  }

  return adaptBackpackScreenToDesign(
    migrateBackpackScreenV1(obj, refW, refH),
    refW,
    refH,
  );
}

/**
 * 将指定节点重置为默认值，其余字段保持不变。
 *
 * @param cfg - 当前背包布局配置
 * @param nodeId - 要重置的节点 id
 * @param refW - 参考设计宽度，默认 1920
 * @param refH - 参考设计高度，默认 1080
 * @returns 新配置（不修改入参）
 *
 * @example
 * ```ts
 * const next = resetBackpackScreenNode(cfg, "itemGrid");
 * // next.nodes.itemGrid 与 defaultBackpackScreen().nodes.itemGrid 深相等
 * ```
 */
export function resetBackpackScreenNode(
  cfg: BackpackScreenConfig,
  nodeId: BackpackNodeId,
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): BackpackScreenConfig {
  const defaults = defaultBackpackScreen(refW, refH);
  const clonedDefaults = cloneNodes(defaults.nodes);

  return {
    ...cfg,
    nodes: {
      ...cfg.nodes,
      [nodeId]: clonedDefaults[nodeId],
    },
  };
}
