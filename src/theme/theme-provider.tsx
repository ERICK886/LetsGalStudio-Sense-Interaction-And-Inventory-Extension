/**
 * theme-provider.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.2
 *
 * React 主题上下文 Provider：向子树提供 mode / setMode / tokens，
 * 并挂载全屏根容器与 UI 字体栈。
 * 0.1.1：可选 rootBackground；运行时叠层可传 transparent，避免挡住引擎对话框。
 * 0.1.2：rootBackground 为 transparent 时根节点 pointer-events:none，点击穿透。
 * 0.1.3：新增 rootPointerEvents，可覆盖上述默认（编辑器预览必须 auto，否则顶栏点不了）。
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ensureFontAwesomeCss } from "../shared/font-awesome";
import { getThemeTokens, type ThemeMode, type ThemeTokens } from "./tokens";

/**
 * ThemeContext 对外暴露的值结构。
 */
export interface ThemeContextValue {
  /** 当前主题模式 */
  mode: ThemeMode;

  /**
   * 切换主题模式。
   *
   * @param mode - 目标模式
   */
  setMode: (mode: ThemeMode) => void;

  /** 当前模式对应的 token 集合（随 mode 自动更新） */
  tokens: ThemeTokens;
}

/** 内部 React Context；默认 undefined 表示未包裹 Provider。 */
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * UI / 标题字体栈（含中文回退）。
 * 用于界面正文、面板标题、按钮等。
 */
export const FONT_FAMILY_UI =
  '"MiSans", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';

/** 默认 UI 字号（px） */
export const FONT_SIZE_DEFAULT = 13;

/** 标题略大一档（px） */
export const FONT_SIZE_TITLE = 14;

/**
 * 根容器推荐样式：整棵 UI 树继承字体与 13px。
 */
export const rootTypographyStyle: {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  WebkitFontSmoothing: "antialiased";
  MozOsxFontSmoothing: "grayscale";
} = {
  fontFamily: FONT_FAMILY_UI,
  fontSize: FONT_SIZE_DEFAULT,
  lineHeight: 1.45,
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
};

/**
 * ThemeProvider 组件属性。
 */
export interface ThemeProviderProps {
  /** 初始主题模式，默认 `"dark"`（与扩展 settings 默认一致） */
  initialMode?: ThemeMode;

  /**
   * 根容器背景 CSS。
   * - 缺省：使用 `tokens.bgBase`（编辑器等需要不透明底）
   * - 传 `"transparent"`：叠在引擎上的运行时/HUD，避免挡住对话框
   */
  rootBackground?: string;

  /**
   * 根容器 pointer-events。
   * - 未传且 `rootBackground === "transparent"` 时默认 `"none"`（玩家叠层穿透）
   * - 编辑器预览等仍要透明底、但整页可点的场景，请显式传 `"auto"`
   */
  rootPointerEvents?: "auto" | "none";

  /** 子组件 */
  children: React.ReactNode;
}

/**
 * 主题 Provider：在组件树顶层包裹，提供主题 mode 与 tokens。
 *
 * @param props.initialMode - 初始主题，默认 `"dark"`
 * @param props.rootBackground - 可选根背景；缺省为主题 bgBase
 * @param props.rootPointerEvents - 可选；覆盖透明底默认的 pointer-events:none
 * @param props.children - 子组件
 * @returns 包裹主题上下文的全屏容器
 *
 * @example
 * ```tsx
 * <ThemeProvider initialMode="dark">
 *   <EditorShell ... />
 * </ThemeProvider>
 *
 * <ThemeProvider initialMode="dark" rootBackground="transparent">
 *   <RuntimeShell ... />
 * </ThemeProvider>
 *
 * <ThemeProvider
 *   initialMode="dark"
 *   rootBackground="transparent"
 *   rootPointerEvents="auto"
 * >
 *   <PreviewShell ... />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({
  initialMode = "dark",
  rootBackground,
  rootPointerEvents,
  children,
}: ThemeProviderProps): React.ReactElement {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  /**
   * 当外部 settings 驱动的 initialMode 变化时同步本地 mode。
   * 避免仅用 useState(initial) 导致项目设置改主题后 UI 不更新。
   */
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    ensureFontAwesomeCss();
  }, []);

  const tokens = useMemo(() => getThemeTokens(mode), [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, tokens }),
    [mode, tokens],
  );

  const background =
    typeof rootBackground === "string" ? rootBackground : tokens.bgBase;

  /**
   * 显式 rootPointerEvents 优先；否则透明底默认 none（玩家叠层穿透）。
   */
  const pointerEvents: "auto" | "none" | undefined =
    rootPointerEvents ??
    (rootBackground === "transparent" ? "none" : undefined);

  return (
    <ThemeContext.Provider value={value}>
      <div
        data-testid="theme-root"
        style={{
          ...rootTypographyStyle,
          width: "100%",
          height: "100%",
          minHeight: 0,
          background,
          color: tokens.textPrimary,
          ...(pointerEvents !== undefined ? { pointerEvents } : {}),
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

/**
 * 读取 ThemeContext 的 Hook。
 *
 * @returns ThemeContextValue（mode / setMode / tokens）
 * @throws 若在 ThemeProvider 外部调用则抛出 Error
 *
 * @example
 * ```tsx
 * const { tokens, setMode } = useTheme();
 * ```
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);

  if (ctx === undefined) {
    throw new Error("useTheme 必须在 ThemeProvider 内部使用");
  }

  return ctx;
}
