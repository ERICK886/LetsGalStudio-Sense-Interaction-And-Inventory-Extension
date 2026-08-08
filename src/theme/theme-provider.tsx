/**
 * theme-provider.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * React 主题上下文 Provider：向子树提供 mode / setMode / tokens，
 * 并挂载全屏根容器与 UI 字体栈。
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
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

  /** 子组件 */
  children: React.ReactNode;
}

/**
 * 主题 Provider：在组件树顶层包裹，提供主题 mode 与 tokens。
 *
 * @param props.initialMode - 初始主题，默认 `"dark"`
 * @param props.children - 子组件
 * @returns 包裹主题上下文的全屏容器
 *
 * @example
 * ```tsx
 * <ThemeProvider initialMode="dark">
 *   <EditorShell ... />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({
  initialMode = "dark",
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

  const tokens = useMemo(() => getThemeTokens(mode), [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, tokens }),
    [mode, tokens],
  );

  return (
    <ThemeContext.Provider value={value}>
      <div
        data-testid="theme-root"
        style={{
          ...rootTypographyStyle,
          width: "100%",
          height: "100%",
          minHeight: 0,
          background: tokens.bgBase,
          color: tokens.textPrimary,
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
