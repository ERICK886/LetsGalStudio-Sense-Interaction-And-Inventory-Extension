/**
 * backpack-screen-config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.4.0
 *
 * 全屏背包布局默认值、v1→v2 迁移与 JSON 规范化（参考设计尺寸 1920×1080）。
 */

import type {
  BackpackNodeId,
  BackpackScreenConfig,
  UiBoxStyle,
  UiRect,
  UiTextStyle,
} from "./types";
import {
  normalizeUiBoxStyle,
  normalizeUiRect,
  normalizeUiTextStyle,
} from "./ui-style";

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
const DEFAULT_GRID_CELL_MIN = 104;

/** 默认详情大图高度 */
const DEFAULT_HERO_HEIGHT = 280;

/** 默认详情区内边距 */
const DEFAULT_DETAIL_PADDING = 24;

/** 默认合成按钮相对详情底边的竖直偏移 */
const DEFAULT_CRAFT_OFFSET_Y = 0;

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
 * 选中槽位默认样式（背景由 accent 派生，此处给中性边框）。
 */
const DEFAULT_GRID_SELECTED_STYLE: UiBoxStyle = {
  borderColor: DEFAULT_ACCENT,
  borderWidth: 1,
  borderRadius: 12,
  background: `${DEFAULT_ACCENT}22`,
};

/**
 * 详情面板默认样式。
 */
const DEFAULT_DETAIL_STYLE: UiBoxStyle = {
  background: "transparent",
  borderColor: "rgba(255, 255, 255, 0.08)",
  borderWidth: 0,
  borderRadius: 0,
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
  label: "×",
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
  fontSize: 14,
  fontWeight: 650,
  label: "合成",
};

/**
 * 标题区 eyebrow 默认文案样式。
 */
const DEFAULT_EYEBROW: UiTextStyle = {
  color: DEFAULT_ACCENT,
  fontSize: 12,
  fontWeight: 700,
  label: "INVENTORY",
};

/**
 * 标题区主标题默认文案样式。
 */
const DEFAULT_TITLE: UiTextStyle = {
  color: "#f2f5f7",
  fontSize: 36,
  fontWeight: 750,
  label: "道具",
};

/**
 * 标题区模式切换链默认文案样式。
 */
const DEFAULT_MODE_LINK: UiTextStyle = {
  color: "rgba(220, 230, 235, 0.82)",
  fontSize: 14,
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
 * 按 brief 公式从 v1 扁平边距/占比计算默认节点几何。
 *
 * @param padX - 水平内边距
 * @param padY - 垂直内边距
 * @param detailRatio - 详情栏宽度占比
 * @param refW - 参考设计宽度
 * @param refH - 参考设计高度
 * @returns panel / grid / detail / title / close 的绝对 rect
 *
 * @example
 * ```ts
 * const g = computeV1Geometry(48, 40, 0.36, 1920, 1080);
 * // g.panel.w === 1824
 * ```
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
    w: refW - padX * 2,
    h: refH - padY * 2,
  };
  const detailW = Math.round(panel.w * detailRatio);
  const gridW = panel.w - detailW;

  let titleY = panel.y - 72;

  if (titleY < 0) {
    titleY = padY;
  }

  return {
    panel,
    itemGrid: { x: panel.x, y: panel.y, w: gridW, h: panel.h },
    detailPanel: {
      x: panel.x + gridW,
      y: panel.y,
      w: detailW,
      h: panel.h,
    },
    titleBlock: {
      x: panel.x + 24,
      y: titleY,
      w: panel.w - 80,
      h: 64,
    },
    closeButton: {
      x: panel.x + panel.w - 56,
      y: panel.y - 64,
      w: 44,
      h: 44,
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
    },
    itemGrid: {
      rect: cloneRect(nodes.itemGrid.rect),
      cellMin: nodes.itemGrid.cellMin,
      style: cloneBoxStyle(nodes.itemGrid.style),
      selectedStyle: nodes.itemGrid.selectedStyle
        ? cloneBoxStyle(nodes.itemGrid.selectedStyle)
        : undefined,
    },
    detailPanel: {
      rect: cloneRect(nodes.detailPanel.rect),
      heroHeight: nodes.detailPanel.heroHeight,
      padding: nodes.detailPanel.padding,
      style: cloneBoxStyle(nodes.detailPanel.style),
    },
    craftButton: {
      offsetY: nodes.craftButton.offsetY,
      style: cloneBoxAndTextStyle(nodes.craftButton.style),
    },
  };
}

/**
 * 返回 v2 约定的全屏背包默认配置（几何按 refW×refH 公式生成）。
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
  const geometry = computeV1Geometry(
    DEFAULT_PAGE_PADDING_X,
    DEFAULT_PAGE_PADDING_Y,
    DEFAULT_DETAIL_RATIO,
    refW,
    refH,
  );

  return {
    version: 2,
    accent: DEFAULT_ACCENT,
    nodes: {
      backdrop: { style: { ...DEFAULT_BACKDROP_STYLE } },
      panelChrome: {
        rect: { ...geometry.panel },
        style: { ...DEFAULT_PANEL_STYLE },
      },
      titleBlock: {
        rect: { ...geometry.titleBlock },
        eyebrow: { ...DEFAULT_EYEBROW },
        title: { ...DEFAULT_TITLE },
        modeLink: { ...DEFAULT_MODE_LINK },
      },
      closeButton: {
        rect: { ...geometry.closeButton },
        style: { ...DEFAULT_CLOSE_STYLE },
      },
      itemGrid: {
        rect: { ...geometry.itemGrid },
        cellMin: DEFAULT_GRID_CELL_MIN,
        style: { ...DEFAULT_GRID_STYLE },
        selectedStyle: { ...DEFAULT_GRID_SELECTED_STYLE },
      },
      detailPanel: {
        rect: { ...geometry.detailPanel },
        heroHeight: DEFAULT_HERO_HEIGHT,
        padding: DEFAULT_DETAIL_PADDING,
        style: { ...DEFAULT_DETAIL_STYLE },
      },
      craftButton: {
        offsetY: DEFAULT_CRAFT_OFFSET_Y,
        style: { ...DEFAULT_CRAFT_STYLE },
      },
    },
  };
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

  return {
    version: 2,
    accent,
    nodes: {
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
        rect: { ...geometry.itemGrid },
        cellMin,
        style: cloneBoxStyle(defaults.nodes.itemGrid.style),
        selectedStyle: defaults.nodes.itemGrid.selectedStyle
          ? cloneBoxStyle(defaults.nodes.itemGrid.selectedStyle)
          : undefined,
      },
      detailPanel: {
        rect: { ...geometry.detailPanel },
        heroHeight,
        padding: defaults.nodes.detailPanel.padding,
        style: cloneBoxStyle(defaults.nodes.detailPanel.style),
      },
    },
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
    };
  }

  const obj = raw as Record<string, unknown>;

  return {
    rect: normalizeUiRect(
      obj.rect as Partial<UiRect> | undefined,
      fallback.rect,
    ),
    style: normalizeBoxAndTextStyle(obj.style, fallback.style),
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
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {
      rect: cloneRect(fallback.rect),
      cellMin: fallback.cellMin,
      style: cloneBoxStyle(fallback.style),
      selectedStyle: fallback.selectedStyle
        ? cloneBoxStyle(fallback.selectedStyle)
        : undefined,
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
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {
      rect: cloneRect(fallback.rect),
      heroHeight: fallback.heroHeight,
      padding: fallback.padding,
      style: cloneBoxStyle(fallback.style),
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
  };
}

/**
 * 规范化 craftButton 节点。
 *
 * @param raw - 原始节点
 * @param fallback - 默认节点
 * @returns 规范化节点
 */
function normalizeCraftButton(
  raw: unknown,
  fallback: BackpackScreenConfig["nodes"]["craftButton"],
): BackpackScreenConfig["nodes"]["craftButton"] {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {
      offsetY: fallback.offsetY,
      style: cloneBoxAndTextStyle(fallback.style),
    };
  }

  const obj = raw as Record<string, unknown>;

  return {
    offsetY: clampNumber(
      obj.offsetY,
      fallback.offsetY ?? DEFAULT_CRAFT_OFFSET_Y,
      -400,
      400,
    ),
    style: normalizeBoxAndTextStyle(obj.style, fallback.style),
  };
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

    return {
      version: 2,
      accent:
        typeof obj.accent === "string" && obj.accent.trim().length > 0
          ? obj.accent.trim()
          : defaults.accent,
      nodes: {
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
      },
    };
  }

  return migrateBackpackScreenV1(obj, refW, refH);
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

/**
 * 过渡期：读取水平内边距（等同旧 `cfg.pagePaddingX`）。
 *
 * Task 4 实现 resolveBackpackLayout 后删除各处适配。
 *
 * @param cfg - v2 背包配置
 * @returns panelChrome.rect.x
 */
export function bagLegacyPagePaddingX(cfg: BackpackScreenConfig): number {
  return cfg.nodes.panelChrome.rect.x;
}

/**
 * 过渡期：读取垂直内边距（等同旧 `cfg.pagePaddingY`）。
 *
 * @param cfg - v2 背包配置
 * @returns panelChrome.rect.y
 */
export function bagLegacyPagePaddingY(cfg: BackpackScreenConfig): number {
  return cfg.nodes.panelChrome.rect.y;
}

/**
 * 过渡期：读取详情栏宽度占比（等同旧 `cfg.detailRatio`）。
 *
 * @param cfg - v2 背包配置
 * @returns detailPanel.w / panelChrome.w（panel 宽非法时回退 0.36）
 */
export function bagLegacyDetailRatio(cfg: BackpackScreenConfig): number {
  const panelW = cfg.nodes.panelChrome.rect.w;
  const detailW = cfg.nodes.detailPanel.rect.w;

  if (
    typeof panelW !== "number" ||
    !Number.isFinite(panelW) ||
    panelW <= 0 ||
    typeof detailW !== "number" ||
    !Number.isFinite(detailW)
  ) {
    return DEFAULT_DETAIL_RATIO;
  }

  return detailW / panelW;
}

/**
 * 过渡期：读取格子最小边（等同旧 `cfg.gridCellMin`）。
 *
 * @param cfg - v2 背包配置
 * @returns itemGrid.cellMin
 */
export function bagLegacyGridCellMin(cfg: BackpackScreenConfig): number {
  return cfg.nodes.itemGrid.cellMin;
}

/**
 * 过渡期：读取大图高度（等同旧 `cfg.heroHeight`）。
 *
 * @param cfg - v2 背包配置
 * @returns detailPanel.heroHeight
 */
export function bagLegacyHeroHeight(cfg: BackpackScreenConfig): number {
  return cfg.nodes.detailPanel.heroHeight;
}
