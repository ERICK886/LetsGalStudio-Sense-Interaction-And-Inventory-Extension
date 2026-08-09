/**
 * inventory-hud.ts
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.3.0
 *
 * 物品栏 HUD 外观默认值、v1→v2 迁移与 JSON 规范化。
 * 「打开背包」已迁为 chrome overlay 按钮组件（role: openBag）。
 */
import { resolveHudLayout } from "./hud-layout";
import type {
  InventoryHudConfig,
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
} from "./layer-order";
import {
  cloneUiOverlayElement,
  normalizeUiOverlays,
} from "./ui-overlay";
import {
  normalizeUiBoxStyle,
  normalizeUiRect,
  normalizeUiTextStyle,
} from "./ui-style";

/** HUD 侧栏固定功能节点（可拖排序）；打开背包已迁为 overlay */
export const HUD_FIXED_LAYER_IDS = ["quickbarRoot"] as const;

/** HUD chrome 图层稳定 id（不可删） */
export const HUD_CHROME_OVERLAY_IDS = {
  openBag: "hud-chrome-open-bag",
} as const;

/**
 * @param id - 图层 id
 * @returns 是否为 HUD chrome 稳定 id
 */
export function isHudChromeOverlayId(id: string): boolean {
  return (Object.values(HUD_CHROME_OVERLAY_IDS) as string[]).includes(id);
}

/** 快捷栏左边距默认值（设计像素） */
const DEFAULT_LEFT = 37;

/** 快捷栏顶边距默认值（设计像素） */
const DEFAULT_TOP = 198;

/** 槽位尺寸默认值（设计像素） */
const DEFAULT_SLOT_SIZE = 64;

/** 槽位间距默认值（设计像素） */
const DEFAULT_GAP = 8;

/** 打开背包按钮默认文案 */
const DEFAULT_OPEN_BAG_LABEL = "打开背包";

/** 打开背包按钮默认矩形（设计像素） */
const DEFAULT_OPEN_BAG_RECT: Required<UiRect> = {
  x: 38,
  y: 776,
  w: 64,
  h: 64,
};

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
 * 「打开背包」按钮默认样式（图标按钮：accent 底半透明 + 圆角 8）。
 */
const DEFAULT_OPEN_BAG_STYLE: UiBoxStyle & UiTextStyle = {
  background: "#64e0d022",
  borderColor: "#64e0d0",
  borderWidth: 1,
  borderRadius: 8,
  color: "#F2F2F4",
  fontSize: 24,
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
    ...cloneUiButtonSkin(node),
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
    ...normalizeUiButtonSkin(obj),
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
 * 由遗留 nodes.openBagButton + resolveHudLayout 生成「打开背包」按钮组件。
 *
 * @param nodes - HUD nodes（含 openBagButton 供迁移）
 * @returns chrome overlays
 */
export function buildHudChromeOverlays(
  nodes: InventoryHudConfig["nodes"],
): UiOverlayElement[] {
  const layout = resolveHudLayout({
    version: 2,
    accent: DEFAULT_ACCENT,
    customCss: "",
    overlays: [],
    nodes,
  });
  const btn = layout.openBagButton;
  // 允许空文案（纯图标）；仅缺省字段时用默认「打开背包」
  const label =
    typeof nodes.openBagButton.style.label === "string"
      ? nodes.openBagButton.style.label.trim()
      : DEFAULT_OPEN_BAG_LABEL;

  return [
    {
      id: HUD_CHROME_OVERLAY_IDS.openBag,
      kind: "button",
      name: "打开背包",
      role: "openBag",
      rect: { x: btn.x, y: btn.y, w: btn.w, h: btn.h },
      zIndex: 10,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: { ...nodes.openBagButton.style, label },
      skin: cloneUiButtonSkin(nodes.openBagButton),
      props: {
        /** 默认纯图标；文案由 style.label 保留供无障碍/重置 */
        text: "",
        icon: "bag-shopping",
        thickness: 2,
        lineStyle: "solid",
        initialIndex: 0,
        initialOn: true,
        initialValue: 60,
        showValue: true,
        maxLength: 0,
        tabGap: 8,
      },
    },
  ];
}

/**
 * 补齐缺失的 HUD chrome overlays；已存在的保留用户编辑。
 *
 * @param overlays - 当前图层
 * @param nodes - 用于生成缺省 chrome
 */
export function ensureHudChromeOverlays(
  overlays: readonly UiOverlayElement[],
  nodes: InventoryHudConfig["nodes"],
): UiOverlayElement[] {
  const seeds = buildHudChromeOverlays(nodes);
  const byId = new Map(overlays.map((el) => [el.id, el]));
  const out: UiOverlayElement[] = [];

  for (const seed of seeds) {
    const existing = byId.get(seed.id);

    if (existing) {
      const cloned = cloneUiOverlayElement(existing);

      if (
        (cloned.role === "openBag" || seed.role === "openBag") &&
        !cloned.props.icon
      ) {
        cloned.props = { ...cloned.props, icon: "bag-shopping" };
      }

      if (cloned.role === "none" || cloned.role === undefined) {
        cloned.role = "openBag";
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
 * 返回 v2 约定的物品栏 HUD 默认配置。
 *
 * @returns 默认 InventoryHudConfig（version: 2）
 *
 * @example
 * ```ts
 * const hud = defaultInventoryHud();
 * // hud.version === 2
 * // hud.nodes.quickbarRoot.rect === { x: 37, y: 198 }
 * ```
 */
export function defaultInventoryHud(): InventoryHudConfig {
  const nodes: InventoryHudConfig["nodes"] = {
    quickbarRoot: {
      rect: { x: DEFAULT_LEFT, y: DEFAULT_TOP },
      direction: "column",
      slotSize: DEFAULT_SLOT_SIZE,
      gap: DEFAULT_GAP,
      slotStyle: { ...DEFAULT_SLOT_STYLE },
      badgeStyle: { ...DEFAULT_BADGE_STYLE },
    },
    openBagButton: {
      layout: "absolute",
      rect: { ...DEFAULT_OPEN_BAG_RECT },
      style: { ...DEFAULT_OPEN_BAG_STYLE },
    },
  };
  const overlays = buildHudChromeOverlays(nodes);

  return {
    version: 2,
    accent: DEFAULT_ACCENT,
    customCss: "",
    overlays,
    layerOrder: ["quickbarRoot", `overlay:${HUD_CHROME_OVERLAY_IDS.openBag}`],
    nodes,
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

  const nodes: InventoryHudConfig["nodes"] = {
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
  };
  const overlays = ensureHudChromeOverlays([], nodes);

  return {
    version: 2,
    accent,
    customCss,
    overlays,
    layerOrder: buildDefaultLayerOrder(HUD_FIXED_LAYER_IDS, overlays),
    nodes,
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
    const nodesRaw = obj.nodes as Record<string, unknown>;
    const nodes: InventoryHudConfig["nodes"] = {
      quickbarRoot: normalizeQuickbarRoot(
        nodesRaw.quickbarRoot,
        defaults.nodes.quickbarRoot,
      ),
      openBagButton: normalizeOpenBagButton(
        nodesRaw.openBagButton,
        defaults.nodes.openBagButton,
      ),
    };
    const overlays = ensureHudChromeOverlays(
      normalizeUiOverlays(obj.overlays),
      nodes,
    );

    return {
      version: 2,
      accent:
        typeof obj.accent === "string" && obj.accent.trim().length > 0
          ? obj.accent.trim()
          : defaults.accent,
      customCss:
        typeof obj.customCss === "string" ? obj.customCss : defaults.customCss,
      overlays,
      layerOrder: normalizeLayerOrder(
        obj.layerOrder,
        HUD_FIXED_LAYER_IDS,
        overlays,
      ),
      nodes,
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

  /** 遗留 openBagButton：重置节点并重建 chrome 打开背包按钮 */
  const nodes: InventoryHudConfig["nodes"] = {
    ...cfg.nodes,
    openBagButton: cloneOpenBagButton(defaults.nodes.openBagButton),
  };
  const withoutChrome = (cfg.overlays ?? []).filter(
    (el) => !isHudChromeOverlayId(el.id),
  );
  const overlays = ensureHudChromeOverlays(withoutChrome, nodes);

  return {
    ...cfg,
    nodes,
    overlays,
    layerOrder: normalizeLayerOrder(
      cfg.layerOrder,
      HUD_FIXED_LAYER_IDS,
      overlays,
    ),
  };
}
