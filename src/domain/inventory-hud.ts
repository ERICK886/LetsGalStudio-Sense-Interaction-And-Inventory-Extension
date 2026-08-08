/**
 * inventory-hud.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 物品栏 HUD 外观默认值、v1→v2 迁移与 JSON 规范化。
 */
import type {
  InventoryHudConfig,
  UiBoxStyle,
  UiRect,
  UiTextStyle,
} from "./types";
import {
  normalizeUiBoxStyle,
  normalizeUiRect,
  normalizeUiTextStyle,
} from "./ui-style";

/** 快捷栏左边距默认值（设计像素） */
const DEFAULT_LEFT = 24;

/** 快捷栏顶边距默认值（设计像素） */
const DEFAULT_TOP = 120;

/** 槽位尺寸默认值（设计像素） */
const DEFAULT_SLOT_SIZE = 64;

/** 槽位间距默认值（设计像素） */
const DEFAULT_GAP = 8;

/** 打开背包按钮默认文案 */
const DEFAULT_OPEN_BAG_LABEL = "打开背包";

/** 强调色默认值（与全屏背包默认 accent 对齐） */
const DEFAULT_ACCENT = "#64e0d0";

/**
 * 槽位默认盒样式（贴近现网 quickbar：圆角 8、深色底、强边框）。
 */
const DEFAULT_SLOT_STYLE: UiBoxStyle = {
  background: "#1F1F26",
  borderColor: "#3C3C48",
  borderWidth: 1,
  borderRadius: 8,
  shadow: 0.35,
};

/**
 * 数量角标默认样式（贴近现网：11px / 700 / 主文本色）。
 */
const DEFAULT_BADGE_STYLE: UiBoxStyle & UiTextStyle = {
  color: "#F2F2F4",
  fontSize: 11,
  fontWeight: 700,
};

/**
 * 「打开背包」按钮默认样式（贴近现网：accent 底半透明 + 圆角 8）。
 */
const DEFAULT_OPEN_BAG_STYLE: UiBoxStyle & UiTextStyle = {
  background: "#64e0d022",
  borderColor: "#64e0d0",
  borderWidth: 1,
  borderRadius: 8,
  color: "#F2F2F4",
  fontSize: 12,
  fontWeight: 600,
  label: DEFAULT_OPEN_BAG_LABEL,
};

/**
 * 将数值钳制为非负有限数，非法时回退 defaultValue。
 *
 * @param value - 原始输入
 * @param defaultValue - 非法时的默认值
 * @returns 非负有限数
 */
function clampNonNegativeNumber(value: unknown, defaultValue: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultValue;
  }

  return Math.max(0, value);
}

/**
 * 深拷贝 quickbarRoot 节点（避免默认对象被调用方就地修改）。
 *
 * @param node - 源节点
 * @returns 独立副本
 */
function cloneQuickbarRoot(
  node: InventoryHudConfig["nodes"]["quickbarRoot"],
): InventoryHudConfig["nodes"]["quickbarRoot"] {
  return {
    rect: { ...node.rect },
    direction: node.direction,
    slotSize: node.slotSize,
    gap: node.gap,
    slotStyle: { ...node.slotStyle },
    badgeStyle: { ...node.badgeStyle },
  };
}

/**
 * 深拷贝 openBagButton 节点。
 *
 * @param node - 源节点
 * @returns 独立副本
 */
function cloneOpenBagButton(
  node: InventoryHudConfig["nodes"]["openBagButton"],
): InventoryHudConfig["nodes"]["openBagButton"] {
  return {
    layout: node.layout,
    rect: node.rect ? { ...node.rect } : undefined,
    style: { ...node.style },
  };
}

/**
 * 规范化盒样式 + 文本样式的交叉类型（按钮 / 角标）。
 *
 * @param raw - 原始对象或部分字段
 * @param fallback - 缺省/非法字段回退
 * @returns 规范化后的 UiBoxStyle & UiTextStyle
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
 * 规范化 quickbarRoot 节点；非法/缺字段回退 fallback。
 *
 * @param raw - 原始节点对象
 * @param fallback - 默认节点
 * @returns 规范化后的 quickbarRoot
 */
function normalizeQuickbarRoot(
  raw: unknown,
  fallback: InventoryHudConfig["nodes"]["quickbarRoot"],
): InventoryHudConfig["nodes"]["quickbarRoot"] {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return cloneQuickbarRoot(fallback);
  }

  const obj = raw as Record<string, unknown>;

  const direction =
    obj.direction === "row" || obj.direction === "column"
      ? obj.direction
      : fallback.direction;

  const normalizedRect = normalizeUiRect(
    obj.rect as Partial<UiRect> | undefined,
    { x: fallback.rect.x, y: fallback.rect.y },
  );

  return {
    rect: { x: normalizedRect.x, y: normalizedRect.y },
    direction,
    slotSize: clampNonNegativeNumber(obj.slotSize, fallback.slotSize),
    gap: clampNonNegativeNumber(obj.gap, fallback.gap),
    slotStyle: normalizeUiBoxStyle(
      obj.slotStyle as Partial<UiBoxStyle> | undefined,
      fallback.slotStyle,
    ),
    badgeStyle: normalizeBoxAndTextStyle(obj.badgeStyle, fallback.badgeStyle),
  };
}

/**
 * 规范化 openBagButton 节点；非法/缺字段回退 fallback。
 *
 * @param raw - 原始节点对象
 * @param fallback - 默认节点
 * @returns 规范化后的 openBagButton
 */
function normalizeOpenBagButton(
  raw: unknown,
  fallback: InventoryHudConfig["nodes"]["openBagButton"],
): InventoryHudConfig["nodes"]["openBagButton"] {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return cloneOpenBagButton(fallback);
  }

  const obj = raw as Record<string, unknown>;

  const layout =
    obj.layout === "absolute" || obj.layout === "belowRoot"
      ? obj.layout
      : fallback.layout;

  const result: InventoryHudConfig["nodes"]["openBagButton"] = {
    layout,
    style: normalizeBoxAndTextStyle(obj.style, fallback.style),
  };

  if (obj.rect !== undefined && obj.rect !== null && typeof obj.rect === "object") {
    result.rect = normalizeUiRect(
      obj.rect as Partial<UiRect>,
      fallback.rect ?? { x: 0, y: 0 },
    );
  } else if (fallback.rect !== undefined) {
    result.rect = { ...fallback.rect };
  }

  return result;
}

/**
 * 返回 v2 约定的物品栏 HUD 默认配置。
 *
 * @returns 默认 InventoryHudConfig（version: 2）
 *
 * @example
 * ```ts
 * const hud = defaultInventoryHud();
 * // hud.version === 2
 * // hud.nodes.quickbarRoot.rect === { x: 24, y: 120 }
 * ```
 */
export function defaultInventoryHud(): InventoryHudConfig {
  return {
    version: 2,
    accent: DEFAULT_ACCENT,
    customCss: "",
    nodes: {
      quickbarRoot: {
        rect: { x: DEFAULT_LEFT, y: DEFAULT_TOP },
        direction: "column",
        slotSize: DEFAULT_SLOT_SIZE,
        gap: DEFAULT_GAP,
        slotStyle: { ...DEFAULT_SLOT_STYLE },
        badgeStyle: { ...DEFAULT_BADGE_STYLE },
      },
      openBagButton: {
        layout: "belowRoot",
        style: { ...DEFAULT_OPEN_BAG_STYLE },
      },
    },
  };
}

/**
 * 将 v1 扁平字段迁移并填入默认 nodes 骨架。
 *
 * @param obj - 原始对象（含 left/top/slotSize 等）
 * @param defaults - 默认 v2 配置
 * @returns 迁移后的 InventoryHudConfig
 */
function migrateV1ToV2(
  obj: Record<string, unknown>,
  defaults: InventoryHudConfig,
): InventoryHudConfig {
  const left = clampNonNegativeNumber(obj.left, defaults.nodes.quickbarRoot.rect.x);
  const top = clampNonNegativeNumber(obj.top, defaults.nodes.quickbarRoot.rect.y);
  const slotSize = clampNonNegativeNumber(
    obj.slotSize,
    defaults.nodes.quickbarRoot.slotSize,
  );
  const gap = clampNonNegativeNumber(obj.gap, defaults.nodes.quickbarRoot.gap);

  const openBagLabel =
    typeof obj.openBagLabel === "string"
      ? obj.openBagLabel
      : defaults.nodes.openBagButton.style.label ?? DEFAULT_OPEN_BAG_LABEL;

  const customCss =
    typeof obj.customCss === "string" ? obj.customCss : defaults.customCss;

  const accent =
    typeof obj.accent === "string" && obj.accent.trim().length > 0
      ? obj.accent.trim()
      : defaults.accent;

  return {
    version: 2,
    accent,
    customCss,
    nodes: {
      quickbarRoot: {
        ...cloneQuickbarRoot(defaults.nodes.quickbarRoot),
        rect: { x: left, y: top },
        slotSize,
        gap,
      },
      openBagButton: {
        ...cloneOpenBagButton(defaults.nodes.openBagButton),
        style: {
          ...defaults.nodes.openBagButton.style,
          label: openBagLabel,
        },
      },
    },
  };
}

/**
 * 将任意 JSON 输入规范化为 InventoryHudConfig（version 2）。
 *
 * - `version === 2` 且 `nodes` 为对象：逐字段 normalize，缺节点用 default
 * - 否则视为 v1：读 `left/top/slotSize/gap/openBagLabel/customCss/accent` 填入默认 nodes
 *
 * @param raw - 原始对象或 undefined
 * @returns 规范化后的 HUD 配置；非法根回退 defaultInventoryHud()
 *
 * @example
 * ```ts
 * normalizeInventoryHud({ left: 40, top: 80, openBagLabel: "背包" });
 * // → version 2，nodes.quickbarRoot.rect = { x: 40, y: 80 }
 * ```
 */
export function normalizeInventoryHud(raw: unknown): InventoryHudConfig {
  const defaults = defaultInventoryHud();

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return defaultInventoryHud();
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
      customCss:
        typeof obj.customCss === "string" ? obj.customCss : defaults.customCss,
      nodes: {
        quickbarRoot: normalizeQuickbarRoot(
          nodes.quickbarRoot,
          defaults.nodes.quickbarRoot,
        ),
        openBagButton: normalizeOpenBagButton(
          nodes.openBagButton,
          defaults.nodes.openBagButton,
        ),
      },
    };
  }

  return migrateV1ToV2(obj, defaults);
}

/**
 * 将指定节点重置为默认值，其余字段保持不变。
 *
 * @param cfg - 当前 HUD 配置
 * @param nodeId - 要重置的节点 id
 * @returns 新配置（不修改入参）
 *
 * @example
 * ```ts
 * const next = resetInventoryHudNode(cfg, "quickbarRoot");
 * // next.nodes.quickbarRoot 与 defaultInventoryHud().nodes.quickbarRoot 深相等
 * ```
 */
export function resetInventoryHudNode(
  cfg: InventoryHudConfig,
  nodeId: "quickbarRoot" | "openBagButton",
): InventoryHudConfig {
  const defaults = defaultInventoryHud();

  if (nodeId === "quickbarRoot") {
    return {
      ...cfg,
      nodes: {
        ...cfg.nodes,
        quickbarRoot: cloneQuickbarRoot(defaults.nodes.quickbarRoot),
      },
    };
  }

  return {
    ...cfg,
    nodes: {
      ...cfg.nodes,
      openBagButton: cloneOpenBagButton(defaults.nodes.openBagButton),
    },
  };
}

/**
 * 过渡期：读取快捷栏左边距（等同旧 `cfg.left`）。
 *
 * Task 3 实现 resolveHudLayout 后删除各处 `.left` 适配。
 *
 * @param cfg - v2 HUD 配置
 * @returns quickbarRoot.rect.x
 */
export function hudLegacyLeft(cfg: InventoryHudConfig): number {
  return cfg.nodes.quickbarRoot.rect.x;
}

/**
 * 过渡期：读取快捷栏顶边距（等同旧 `cfg.top`）。
 *
 * Task 3 实现 resolveHudLayout 后删除各处 `.top` 适配。
 *
 * @param cfg - v2 HUD 配置
 * @returns quickbarRoot.rect.y
 */
export function hudLegacyTop(cfg: InventoryHudConfig): number {
  return cfg.nodes.quickbarRoot.rect.y;
}
