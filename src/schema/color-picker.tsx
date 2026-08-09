/**
 * 文件名：color-picker.tsx
 * 作者：池水三两升
 * 日期：2026-08-08
 * 版本：0.1.0
 * 描述：独立颜色选择器（SV / 色相 / Alpha / HEX·RGB·HSL），自 QTE 移植并改用 ThemeTokens。
 *
 * 移植自 QTE `qte-editor/color-picker.tsx`（v1.2.1），主要适配：
 * - 移除 `../ui-fonts` 依赖，字体改用系统栈（UI: system-ui；等宽: ui-monospace）
 * - 主题色取自 `ThemeTokens`（`useTheme()` 或可选 `tokens` prop），不再硬编码深色面板
 * - `allowAlpha === false` 时不渲染 Alpha 滑条，输出截断为 `#RRGGBB`
 * - `value` 为空时触发器进入空态，`placeholder` 仅作提示；面板首次合法变更才触发 `onChange`
 * - 新增 `disabled` / `placeholder` / `tokens` / `ariaLabel` props
 * - 保留 `createPortal` 弹层与左翻 / 上翻 + resize/scroll 定位逻辑
 *
 * 弹出层经 `createPortal` 挂到 `document.body`，并用 resize/scroll/ResizeObserver
 * 监听视口与面板尺寸，自动左翻/上翻，避免被右侧属性栏裁切。
 * HEX / 数值输入使用本地草稿，仅在完整合法时提交，避免退格或「0.」中间态被重置。
 *
 * @example
 * ```tsx
 * <ColorPicker
 *   value="#31BA29FF"
 *   onChange={(next) => console.log(next)}
 *   allowAlpha
 * />
 * ```
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";

/** UI 字体栈：系统无衬线，避免依赖外部字体包 */
const FONT_UI = "system-ui, sans-serif";

/** 等宽字体栈：用于 HEX / 数值输入，回退到系统等宽 */
const FONT_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** UI 字号（px），取 12–13 区间下限 */
const FONT_SIZE_UI = 12;

/** 弹出面板默认宽度（px） */
const POPOVER_WIDTH = 260;

/** 触发器与面板间距（px） */
const POPOVER_GAP = 6;

/** 相对视口边缘的安全边距（px） */
const VIEWPORT_PAD = 8;

/**
 * ColorPicker 的 props。
 *
 * @property value       - 当前 CSS 颜色（支持 #RGB / #RRGGBB / #RRGGBBAA / rgba）；空串进入空态
 * @property onChange    - 颜色变更；始终输出 `#RRGGBB` 或（allowAlpha 时）`#RRGGBBAA`
 * @property allowAlpha  - 是否编辑透明度，默认 false
 * @property label       - 可选字段标签（显示在色块左侧）
 * @property disabled    - 禁用时不可打开面板，触发器降低透明度
 * @property placeholder - 空态提示文案（仅作展示，不参与提交）
 * @property tokens      - 可选主题 token；未传则取 `useTheme().tokens`
 * @property ariaLabel   - 触发器无障碍标签
 */
export interface ColorPickerProps {
  value: string;
  onChange: (css: string) => void;
  allowAlpha?: boolean;
  label?: string;
  disabled?: boolean;
  placeholder?: string;
  tokens?: ThemeTokens;
  ariaLabel?: string;
}

/** 内部 RGBA（通道 0–255，alpha 0–1） */
interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** HSV（h 0–360，s/v 0–1） */
interface Hsv {
  h: number;
  s: number;
  v: number;
}

type ColorMode = "HEX" | "RGB" | "HSL";

/**
 * 将数值限制在闭区间内。
 *
 * @param n - 输入
 * @param min - 下限
 * @param max - 上限
 * @returns 裁剪后的数
 */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * 尝试解析 CSS 颜色；不完整或非法时返回 `null`（不回退默认色）。
 * 供 HEX 输入框边打边解析：只有合法完整值才提交，避免退格被重置。
 *
 * @param css - 原始颜色字符串
 * @returns RGBA，或 `null` 表示暂不可用
 *
 * @example
 * ```ts
 * tryParseCssColor("#9103AAB3"); // { r, g, b, a }
 * tryParseCssColor("#9103AAB");  // null（7 位，非法）
 * ```
 */
export function tryParseCssColor(css: string): Rgba | null {
  const t = css.trim();
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(t);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  const rgba =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
      t,
    );
  if (rgba) {
    return {
      r: clamp(Number(rgba[1]), 0, 255),
      g: clamp(Number(rgba[2]), 0, 255),
      b: clamp(Number(rgba[3]), 0, 255),
      a: rgba[4] !== undefined ? clamp(Number(rgba[4]), 0, 1) : 1,
    };
  }

  return null;
}

/**
 * 解析 CSS 颜色为 RGBA。
 *
 * 支持：`#RGB`、`#RRGGBB`、`#RRGGBBAA`、`rgba(r,g,b,a)`、`rgb(r,g,b)`。
 * 无法解析时回退不透明白。
 *
 * @param css - 原始颜色字符串
 * @returns RGBA
 */
export function parseCssColor(css: string): Rgba {
  return tryParseCssColor(css) ?? { r: 255, g: 255, b: 255, a: 1 };
}

/**
 * RGBA → `#RRGGBB` 或 `#RRGGBBAA`。
 *
 * @param rgba - 通道
 * @param withAlpha - 是否输出 AA
 * @returns 大写 hex 字符串
 */
export function rgbaToHex(rgba: Rgba, withAlpha: boolean): string {
  const to2 = (n: number) =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0").toUpperCase();
  const base = `#${to2(rgba.r)}${to2(rgba.g)}${to2(rgba.b)}`;
  if (!withAlpha) {
    return base;
  }
  return `${base}${to2(rgba.a * 255)}`;
}

/**
 * RGB（0–255）→ HSV。
 *
 * @param r - 红
 * @param g - 绿
 * @param b - 蓝
 * @returns HSV
 */
function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) * 60;
    } else {
      h = ((rn - gn) / d + 4) * 60;
    }
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

/**
 * HSV → RGB（0–255）。
 *
 * @param h - 色相 0–360
 * @param s - 饱和度 0–1
 * @param v - 明度 0–1
 * @returns RGB
 */
function hsvToRgb(
  h: number,
  s: number,
  v: number,
): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

/**
 * RGB → HSL（h 0–360，s/l 0–1）。
 *
 * @param r - 红 0–255
 * @param g - 绿
 * @param b - 蓝
 * @returns HSL
 */
function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) * 60;
    } else {
      h = ((rn - gn) / d + 4) * 60;
    }
  }
  return { h, s, l };
}

/**
 * HSL → RGB。
 *
 * @param h - 色相
 * @param s - 饱和度 0–1
 * @param l - 亮度 0–1
 * @returns RGB 0–255
 */
function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, hh + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hh) * 255),
    b: Math.round(hue2rgb(p, q, hh - 1 / 3) * 255),
  };
}

/** Alpha 棋盘底纹 */
const CHECKER =
  "linear-gradient(45deg, #555 25%, transparent 25%), " +
  "linear-gradient(-45deg, #555 25%, transparent 25%), " +
  "linear-gradient(45deg, transparent 75%, #555 75%), " +
  "linear-gradient(-45deg, transparent 75%, #555 75%)";

/**
 * 编辑器壳根节点标记，供 ColorPicker 夹紧定位（避免跑出扩展面板）。
 * 宿主可在面板容器上挂该属性以启用壳内夹紧；未挂时回退到视口。
 */
export const COLOR_PICKER_SHELL_ATTR = "data-color-picker-shell";

/**
 * 查找夹紧边界：编辑器壳矩形；找不到则用 visualViewport / window。
 *
 * @param trigger - 触发按钮
 * @returns 视口坐标系下的边界
 */
function resolveClampBounds(trigger: HTMLElement): DOMRect {
  const host = trigger.closest(`[${COLOR_PICKER_SHELL_ATTR}]`);
  if (host instanceof HTMLElement) {
    return host.getBoundingClientRect();
  }
  const vv = window.visualViewport;
  if (vv) {
    return new DOMRect(vv.offsetLeft, vv.offsetTop, vv.width, vv.height);
  }
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

/**
 * 计算弹出层 `position:fixed` 的视口坐标（与 getBoundingClientRect 同一空间）。
 *
 * 策略（适合右侧属性栏）：
 * 1. 优先放在触发器**左侧**（紧贴色块左边）
 * 2. 左侧放不下则改为触发器下方、右对齐
 * 3. 下方不够则翻到上方
 * 4. 最终夹紧在编辑器壳内，不跑出扩展 UI
 *
 * @param anchor - 触发按钮矩形
 * @param popW - 面板宽
 * @param popH - 面板高
 * @param bounds - 夹紧边界（编辑器壳）
 * @returns `{ top, left }` 视口坐标，直接用于 fixed
 */
function computePopoverFixedPos(
  anchor: DOMRect,
  popW: number,
  popH: number,
  bounds: DOMRect,
): { top: number; left: number } {
  const leftMin = bounds.left + VIEWPORT_PAD;
  const leftMax = bounds.right - VIEWPORT_PAD - popW;
  const topMin = bounds.top + VIEWPORT_PAD;
  const topMax = bounds.bottom - VIEWPORT_PAD - popH;

  // 1) 优先：触发器左侧
  let left = anchor.left - POPOVER_GAP - popW;
  if (left < leftMin) {
    // 2) 退回：与触发器右对齐（面板盖在属性栏内侧）
    left = anchor.right - popW;
  }
  left = clamp(left, leftMin, Math.max(leftMin, leftMax));

  // 垂直：默认贴在触发器下方；不够则翻到上方
  let top = anchor.bottom + POPOVER_GAP;
  if (top + popH > bounds.bottom - VIEWPORT_PAD) {
    top = anchor.top - POPOVER_GAP - popH;
  }
  // 若翻到上方仍过高，与触发器顶对齐再夹紧
  if (top < topMin) {
    top = anchor.top;
  }
  top = clamp(top, topMin, Math.max(topMin, topMax));

  return { top, left };
}

/**
 * 独立颜色选择器：色块触发 + Portal 弹出面板（监听视口，避免跑出容器）。
 *
 * @returns 颜色选择器 React 节点
 */
export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  allowAlpha = false,
  label,
  disabled = false,
  placeholder,
  tokens,
  ariaLabel,
}) => {
  // 主题：无条件调用 useTheme（Rules of Hooks），优先使用传入 tokens
  const { tokens: themeFromCtx } = useTheme();
  const themeTokens = tokens ?? themeFromCtx;

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ColorMode>("HEX");
  /** 弹出层 fixed 视口坐标（与 getBoundingClientRect 同空间，禁止再换算） */
  const [popPos, setPopPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  /** 首帧定位完成前隐藏，避免闪到错误位置 */
  const [placed, setPlaced] = useState(false);

  /** value 去除空白后为空时进入空态 */
  const isEmpty = value.trim() === "";

  const parsed = useMemo(() => parseCssColor(value), [value]);
  const hsv = useMemo(
    () => rgbToHsv(parsed.r, parsed.g, parsed.b),
    [parsed.r, parsed.g, parsed.b],
  );

  const [draftH, setDraftH] = useState(hsv.h);
  const [draftS, setDraftS] = useState(hsv.s);
  const [draftV, setDraftV] = useState(hsv.v);
  // allowAlpha false 时强制 alpha=1，截断外部八位值的 alpha
  const [draftA, setDraftA] = useState(allowAlpha ? parsed.a : 1);

  // 外部 value 变化时同步草稿（面板关闭或非拖拽时）
  useEffect(() => {
    if (!open) {
      setDraftH(hsv.h);
      setDraftS(hsv.s);
      setDraftV(hsv.v);
      setDraftA(allowAlpha ? parsed.a : 1);
    }
  }, [hsv.h, hsv.s, hsv.v, parsed.a, open, allowAlpha]);

  const commit = useCallback(
    (h: number, s: number, v: number, a: number) => {
      const rgb = hsvToRgb(h, s, v);
      const next = rgbaToHex(
        { ...rgb, a: allowAlpha ? a : 1 },
        allowAlpha,
      );
      onChange(next);
    },
    [allowAlpha, onChange],
  );

  /** 供连续手势结束时读取最新草稿，避免闭包过期 */
  const draftRef = useRef({ h: draftH, s: draftS, v: draftV, a: draftA });
  draftRef.current = { h: draftH, s: draftS, v: draftV, a: draftA };

  /**
   * 仅更新面板草稿（拖 SV / 滑条过程），不写入表单 / 撤销栈。
   */
  const applyHsvLive = useCallback(
    (h: number, s: number, v: number, a: number) => {
      setDraftH(h);
      setDraftS(s);
      setDraftV(v);
      setDraftA(a);
      draftRef.current = { h, s, v, a };
    },
    [],
  );

  /**
   * 更新草稿并立刻提交（离散编辑：HEX / 模式字段等）。
   */
  const applyHsv = useCallback(
    (h: number, s: number, v: number, a: number) => {
      applyHsvLive(h, s, v, a);
      commit(h, s, v, a);
    },
    [applyHsvLive, commit],
  );

  /**
   * 连续手势结束：用当前草稿提交一次。
   */
  const flushDraftCommit = useCallback(() => {
    const d = draftRef.current;
    commit(d.h, d.s, d.v, d.a);
  }, [commit]);

  /**
   * 用触发器 getBoundingClientRect 直接写 fixed 坐标，夹紧在编辑器壳内。
   * 不再做 absolute / 壳内相对换算，避免「隔得很远」。
   */
  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const anchor = trigger.getBoundingClientRect();
    const bounds = resolveClampBounds(trigger);
    const popEl = popoverRef.current;
    const popH = popEl?.offsetHeight ?? 360;
    const popW = popEl?.offsetWidth ?? POPOVER_WIDTH;
    setPopPos(computePopoverFixedPos(anchor, popW, popH, bounds));
    setPlaced(true);
  }, []);

  // 打开后定位，并监听 resize / scroll / 尺寸变化
  useLayoutEffect(() => {
    if (!open) {
      setPlaced(false);
      return;
    }

    const onReposition = () => updatePopoverPosition();
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      updatePopoverPosition();
      raf2 = window.requestAnimationFrame(() => updatePopoverPosition());
    });

    window.addEventListener("resize", onReposition);
    // 捕获阶段：属性栏内部滚动也会触发
    window.addEventListener("scroll", onReposition, true);

    let ro: ResizeObserver | null = null;
    const observeTimer = window.setTimeout(() => {
      if (typeof ResizeObserver === "undefined") {
        return;
      }
      ro = new ResizeObserver(onReposition);
      if (popoverRef.current) {
        ro.observe(popoverRef.current);
      }
      const shell = triggerRef.current?.closest(
        `[${COLOR_PICKER_SHELL_ATTR}]`,
      );
      if (shell) {
        ro.observe(shell);
      }
    }, 0);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(observeTimer);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      ro?.disconnect();
    };
  }, [open, mode, allowAlpha, updatePopoverPosition]);

  // 点击外部关闭（触发器与 Portal 面板之外）
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) {
        return;
      }
      if (popoverRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const displayHex = rgbaToHex(
    { ...hsvToRgb(draftH, draftS, draftV), a: draftA },
    allowAlpha,
  );
  const solidHex = rgbaToHex(
    { ...hsvToRgb(draftH, draftS, draftV), a: 1 },
    false,
  );
  const hueColor = rgbaToHex({ ...hsvToRgb(draftH, 1, 1), a: 1 }, false);
  const liveRgb = hsvToRgb(draftH, draftS, draftV);

  const popover = open
    ? createPortal(
        <div
          ref={popoverRef}
          style={{
            // 与 getBoundingClientRect 同一视口坐标系，禁止再做壳内相对换算
            position: "fixed",
            zIndex: 10000,
            top: popPos.top,
            left: popPos.left,
            width: POPOVER_WIDTH,
            boxSizing: "border-box",
            padding: 12,
            borderRadius: 10,
            background: themeTokens.bgElevated,
            border: `1px solid ${themeTokens.border}`,
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.55)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE_UI,
            color: themeTokens.textPrimary,
            visibility: placed ? "visible" : "hidden",
            pointerEvents: placed ? "auto" : "none",
          }}
        >
          {/* 顶栏：预览 + hex */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundImage: CHECKER,
                backgroundSize: "8px 8px",
                overflow: "hidden",
                border: `1px solid ${themeTokens.border}`,
                flex: "0 0 auto",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  background: `rgba(${liveRgb.r},${liveRgb.g},${liveRgb.b},${draftA})`,
                }}
              />
            </span>
            <HexTextInput
              committedHex={displayHex}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "6px 8px",
                borderRadius: 6,
                border: `1px solid ${themeTokens.accent}`,
                background: themeTokens.bgSunken,
                color: themeTokens.textPrimary,
                fontFamily: FONT_MONO,
                fontSize: FONT_SIZE_UI,
                outline: "none",
              }}
              onCommit={(rgba) => {
                const nextHsv = rgbToHsv(rgba.r, rgba.g, rgba.b);
                applyHsv(nextHsv.h, nextHsv.s, nextHsv.v, rgba.a);
              }}
            />
          </div>

          <SvBoard
            hue={draftH}
            saturation={draftS}
            value={draftV}
            onChange={(s, v) => applyHsvLive(draftH, s, v, draftA)}
            onGestureEnd={flushDraftCommit}
          />

          <HueSlider
            hue={draftH}
            tokens={themeTokens}
            onChange={(h) => applyHsvLive(h, draftS, draftV, draftA)}
            onGestureEnd={flushDraftCommit}
          />

          {allowAlpha && (
            <AlphaSlider
              color={hueColor}
              alpha={draftA}
              tokens={themeTokens}
              onChange={(a) => applyHsvLive(draftH, draftS, draftV, a)}
              onGestureEnd={flushDraftCommit}
            />
          )}

          <ModeTabs mode={mode} onChange={setMode} tokens={themeTokens} />

          <ModeFields
            mode={mode}
            h={draftH}
            s={draftS}
            v={draftV}
            a={draftA}
            allowAlpha={allowAlpha}
            tokens={themeTokens}
            onHsv={(nh, ns, nv, na) => applyHsv(nh, ns, nv, na)}
          />
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontFamily: FONT_UI,
        fontSize: FONT_SIZE_UI,
      }}
    >
      {label && (
        <span
          style={{ color: themeTokens.textMuted, fontWeight: 500 }}
        >
          {label}
        </span>
      )}

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => {
          if (!disabled) {
            setOpen((o) => !o);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: 4,
          borderRadius: 8,
          border: `1px solid ${themeTokens.border}`,
          background: themeTokens.bgSunken,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            flex: "0 0 auto",
            backgroundImage: isEmpty ? undefined : CHECKER,
            backgroundSize: isEmpty ? undefined : "8px 8px",
            backgroundPosition: isEmpty
              ? undefined
              : "0 0, 0 4px, 4px -4px, -4px 0",
            overflow: "hidden",
            border: isEmpty
              ? `1px dashed ${themeTokens.borderStrong}`
              : `1px solid ${themeTokens.border}`,
          }}
        >
          {isEmpty ? null : (
            <span
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                background:
                  displayHex.length === 9
                    ? `rgba(${liveRgb.r},${liveRgb.g},${liveRgb.b},${draftA})`
                    : solidHex,
              }}
            />
          )}
        </span>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: FONT_SIZE_UI,
            color: isEmpty ? themeTokens.textMuted : themeTokens.textPrimary,
          }}
        >
          {isEmpty ? (placeholder ?? "#RRGGBB") : displayHex}
        </span>
      </button>

      {popover}
    </div>
  );
};

/**
 * SV 饱和度/明度面板。
 */
const SvBoard: React.FC<{
  hue: number;
  saturation: number;
  value: number;
  onChange: (s: number, v: number) => void;
  /** 拖拽结束：父级应提交一次 */
  onGestureEnd?: () => void;
}> = ({ hue, saturation, value, onChange, onGestureEnd }) => {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const onGestureEndRef = useRef(onGestureEnd);
  onGestureEndRef.current = onGestureEnd;

  const pick = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const s = clamp((clientX - rect.left) / rect.width, 0, 1);
      const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
      onChange(s, v);
    },
    [onChange],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current) {
        pick(e.clientX, e.clientY);
      }
    };
    const onUp = () => {
      if (!dragging.current) {
        return;
      }

      dragging.current = false;
      onGestureEndRef.current?.();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [pick]);

  const hueHex = rgbaToHex({ ...hsvToRgb(hue, 1, 1), a: 1 }, false);

  return (
    <div
      ref={ref}
      onMouseDown={(e) => {
        dragging.current = true;
        pick(e.clientX, e.clientY);
      }}
      style={{
        position: "relative",
        width: "100%",
        paddingTop: "75%",
        borderRadius: 8,
        cursor: "crosshair",
        background: `
          linear-gradient(to top, #000, transparent),
          linear-gradient(to right, #fff, ${hueHex})
        `,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: `${saturation * 100}%`,
          top: `${(1 - value) * 100}%`,
          width: 14,
          height: 14,
          marginLeft: -7,
          marginTop: -7,
          borderRadius: "50%",
          border: "2px solid #fff",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.45)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

/**
 * 色相滑条。
 */
const HueSlider: React.FC<{
  hue: number;
  tokens: ThemeTokens;
  onChange: (h: number) => void;
  onGestureEnd?: () => void;
}> = ({ hue, tokens, onChange, onGestureEnd }) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 14, color: tokens.textMuted, fontSize: 12 }}>H</span>
      <input
        type="range"
        min={0}
        max={360}
        value={Math.round(hue)}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={() => onGestureEnd?.()}
        onTouchEnd={() => onGestureEnd?.()}
        onKeyUp={() => onGestureEnd?.()}
        style={{
          flex: 1,
          height: 12,
          borderRadius: 999,
          appearance: "none",
          background:
            "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
          outline: "none",
          cursor: "pointer",
        }}
      />
    </div>
  );
};

/**
 * Alpha 滑条（棋盘底 + 当前色渐变）。
 */
const AlphaSlider: React.FC<{
  color: string;
  alpha: number;
  tokens: ThemeTokens;
  onChange: (a: number) => void;
  onGestureEnd?: () => void;
}> = ({ color, alpha, tokens, onChange, onGestureEnd }) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 14, color: tokens.textMuted, fontSize: 12 }}>A</span>
      <div
        style={{
          flex: 1,
          height: 12,
          borderRadius: 999,
          backgroundImage: `${CHECKER}, linear-gradient(to right, transparent, ${color})`,
          backgroundSize: "8px 8px, 100% 100%",
          backgroundPosition: "0 0, 0 0",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(alpha * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          onMouseUp={() => onGestureEnd?.()}
          onTouchEnd={() => onGestureEnd?.()}
          onKeyUp={() => onGestureEnd?.()}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            margin: 0,
            opacity: 0.01,
            cursor: "pointer",
          }}
        />
      </div>
    </div>
  );
};

/**
 * HEX 文本输入：本地草稿 + 仅合法时提交。
 *
 * 根因：若直接用 `value={已提交 hex}` 且 onChange 里对不完整串
 * `parseCssColor`（失败回退白/旧色）再写回，退格会立刻被重置。
 *
 * @param committedHex - 已提交的规范 hex（来自 HSV）
 * @param onCommit     - 解析成功时回调 RGBA
 * @param style        - 输入框样式
 */
const HexTextInput: React.FC<{
  committedHex: string;
  onCommit: (rgba: Rgba) => void;
  style?: React.CSSProperties;
}> = ({ committedHex, onCommit, style }) => {
  const [text, setText] = useState(committedHex);
  const focusedRef = useRef(false);

  // 外部颜色变化（SV / 滑条）时同步；编辑中不打断草稿
  useEffect(() => {
    if (!focusedRef.current) {
      setText(committedHex);
    }
  }, [committedHex]);

  return (
    <input
      type="text"
      value={text}
      spellCheck={false}
      style={style}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        const parsed = tryParseCssColor(text);
        if (parsed) {
          onCommit(parsed);
        } else {
          // 失焦时非法内容回退为已提交值
          setText(committedHex);
        }
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const parsed = tryParseCssColor(raw);
        if (parsed) {
          onCommit(parsed);
        }
      }}
    />
  );
};

/**
 * 数值文本输入：本地草稿 + 仅完整数字时提交。
 *
 * 避免 `0.` / `.` 等中间态被 `Number(...)` 立刻规范化写回（如 `1.`→`1`，
 * 或 `0.` 后再打 `2` 变成 `02`→clamp 成 `1`）。
 *
 * @param value    - 已提交数值
 * @param min      - 下限
 * @param max      - 最大值
 * @param decimals - 失焦/外部同步时的展示小数位；整数通道用 0
 * @param onCommit - 解析成功时回调（已 clamp）
 * @param style    - 输入框样式
 */
const NumberTextInput: React.FC<{
  value: number;
  min: number;
  max: number;
  decimals?: number;
  onCommit: (n: number) => void;
  style?: React.CSSProperties;
}> = ({ value, min, max, decimals = 2, onCommit, style }) => {
  /**
   * 将已提交值格式化为展示字符串。
   *
   * @param n - 数值
   * @returns 展示用文本
   */
  const formatCommitted = (n: number): string => {
    if (decimals <= 0) {
      return String(Math.round(n));
    }
    const factor = 10 ** decimals;
    return String(Math.round(n * factor) / factor);
  };

  const [text, setText] = useState(() => formatCommitted(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(formatCommitted(value));
    }
  }, [value, decimals]);

  /**
   * 尝试把草稿解析为可提交数字。
   * 空串、单独符号、末尾小数点等中间态返回 `null`。
   *
   * @param raw - 输入草稿
   * @returns 有限数字或 `null`
   */
  const tryParseDraft = (raw: string): number | null => {
    const t = raw.trim();
    if (t === "" || t === "-" || t === "." || t === "-.") {
      return null;
    }
    // 「0.」「1.」等：保留小数点，暂不提交，避免被写回成「0」「1」
    if (t.endsWith(".")) {
      return null;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      spellCheck={false}
      style={style}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        const parsed = tryParseDraft(text);
        if (parsed !== null) {
          onCommit(clamp(parsed, min, max));
        } else {
          setText(formatCommitted(value));
        }
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const parsed = tryParseDraft(raw);
        if (parsed !== null) {
          onCommit(clamp(parsed, min, max));
        }
      }}
    />
  );
};

/**
 * HEX / RGB / HSL 模式切换。
 */
const ModeTabs: React.FC<{
  mode: ColorMode;
  onChange: (m: ColorMode) => void;
  tokens: ThemeTokens;
}> = ({ mode, onChange, tokens }) => {
  const tabs: ColorMode[] = ["HEX", "RGB", "HSL"];
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: 2,
        borderRadius: 8,
        background: tokens.bgSunken,
      }}
    >
      {tabs.map((t) => {
        const active = mode === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            style={{
              flex: 1,
              padding: "5px 0",
              border: "none",
              borderRadius: 6,
              fontFamily: FONT_UI,
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              color: active ? tokens.textPrimary : tokens.textMuted,
              background: active ? tokens.border : "transparent",
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
};

/**
 * 按模式显示的数值输入区。
 */
const ModeFields: React.FC<{
  mode: ColorMode;
  h: number;
  s: number;
  v: number;
  a: number;
  allowAlpha: boolean;
  tokens: ThemeTokens;
  onHsv: (h: number, s: number, v: number, a: number) => void;
}> = ({ mode, h, s, v, a, allowAlpha, tokens, onHsv }) => {
  const rgb = hsvToRgb(h, s, v);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const hex = rgbaToHex({ ...rgb, a }, allowAlpha);

  /**
   * 数值输入公共样式。
   * 注意：原生 `<input>` 默认有较大固有宽度（约 size=20），
   * 必须 width:100% + box-sizing，否则会在窄列（如 Alpha）里撑破弹出层。
   * flex 应放在列容器上，不要写在 input 本身。
   */
  const fieldStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "6px 8px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: tokens.bgSunken,
    color: tokens.textPrimary,
    fontFamily: FONT_MONO,
    fontSize: FONT_SIZE_UI,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: tokens.textMuted,
    marginBottom: 4,
  };

  if (mode === "HEX") {
    return (
      <div style={{ display: "flex", gap: 8, width: "100%", minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={labelStyle}>HEX</div>
          <HexTextInput
            committedHex={hex}
            style={{ ...fieldStyle, borderColor: tokens.accent }}
            onCommit={(rgba) => {
              const nh = rgbToHsv(rgba.r, rgba.g, rgba.b);
              onHsv(nh.h, nh.s, nh.v, rgba.a);
            }}
          />
        </div>
        {allowAlpha && (
          <div style={{ flex: "0 0 56px", width: 56, minWidth: 0 }}>
            <div style={labelStyle}>A</div>
            <NumberTextInput
              style={fieldStyle}
              value={a}
              min={0}
              max={1}
              decimals={2}
              onCommit={(n) => onHsv(h, s, v, n)}
            />
          </div>
        )}
      </div>
    );
  }

  if (mode === "RGB") {
    return (
      <div style={{ display: "flex", gap: 6, width: "100%", minWidth: 0 }}>
        {(
          [
            [
              "R",
              rgb.r,
              (n: number) => {
                const nh = rgbToHsv(n, rgb.g, rgb.b);
                onHsv(nh.h, nh.s, nh.v, a);
              },
            ],
            [
              "G",
              rgb.g,
              (n: number) => {
                const nh = rgbToHsv(rgb.r, n, rgb.b);
                onHsv(nh.h, nh.s, nh.v, a);
              },
            ],
            [
              "B",
              rgb.b,
              (n: number) => {
                const nh = rgbToHsv(rgb.r, rgb.g, n);
                onHsv(nh.h, nh.s, nh.v, a);
              },
            ],
          ] as const
        ).map(([lab, val, set]) => (
          <div key={lab} style={{ flex: 1, minWidth: 0 }}>
            <div style={labelStyle}>{lab}</div>
            <NumberTextInput
              style={fieldStyle}
              value={val}
              min={0}
              max={255}
              decimals={0}
              onCommit={set}
            />
          </div>
        ))}
        {allowAlpha && (
          <div style={{ flex: "0 0 52px", width: 52, minWidth: 0 }}>
            <div style={labelStyle}>A</div>
            <NumberTextInput
              style={fieldStyle}
              value={a}
              min={0}
              max={1}
              decimals={2}
              onCommit={(n) => onHsv(h, s, v, n)}
            />
          </div>
        )}
      </div>
    );
  }

  // HSL
  return (
    <div style={{ display: "flex", gap: 6, width: "100%", minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={labelStyle}>H</div>
        <NumberTextInput
          style={fieldStyle}
          value={Math.round(hsl.h)}
          min={0}
          max={360}
          decimals={0}
          onCommit={(n) => {
            const next = hslToRgb(n, hsl.s, hsl.l);
            const nh = rgbToHsv(next.r, next.g, next.b);
            onHsv(nh.h, nh.s, nh.v, a);
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={labelStyle}>S</div>
        <NumberTextInput
          style={fieldStyle}
          value={Math.round(hsl.s * 100)}
          min={0}
          max={100}
          decimals={0}
          onCommit={(n) => {
            const next = hslToRgb(hsl.h, n / 100, hsl.l);
            const nh = rgbToHsv(next.r, next.g, next.b);
            onHsv(nh.h, nh.s, nh.v, a);
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={labelStyle}>L</div>
        <NumberTextInput
          style={fieldStyle}
          value={Math.round(hsl.l * 100)}
          min={0}
          max={100}
          decimals={0}
          onCommit={(n) => {
            const next = hslToRgb(hsl.h, hsl.s, n / 100);
            const nh = rgbToHsv(next.r, next.g, next.b);
            onHsv(nh.h, nh.s, nh.v, a);
          }}
        />
      </div>
      {allowAlpha && (
        <div style={{ flex: "0 0 52px", width: 52, minWidth: 0 }}>
          <div style={labelStyle}>A</div>
          <NumberTextInput
            style={fieldStyle}
            value={a}
            min={0}
            max={1}
            decimals={2}
            onCommit={(n) => onHsv(h, s, v, n)}
          />
        </div>
      )}
    </div>
  );
};
