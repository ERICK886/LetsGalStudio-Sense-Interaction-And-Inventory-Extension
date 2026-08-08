/**
 * tokens.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景交互系统主题 token：light / dark 两套配色。
 * 深色主背景约 #17171B；强调色为青绿（避免紫渐变 / 奶油陶土 AI 套路）。
 */

/** 主题模式：浅色或深色。 */
export type ThemeMode = "light" | "dark";

/**
 * 主题 token 集合，供 UI 组件统一引用颜色变量。
 */
export interface ThemeTokens {
  /** 当前主题模式 */
  mode: ThemeMode;

  /** 强调色（品牌青绿） */
  accent: string;

  /** 基础背景色 */
  bgBase: string;

  /** 抬升层背景色（顶栏、侧栏） */
  bgElevated: string;

  /** 下沉层背景色（输入框、凹槽区域） */
  bgSunken: string;

  /** 普通边框色 */
  border: string;

  /** 强边框色（分隔线、选中框） */
  borderStrong: string;

  /** 主文本色 */
  textPrimary: string;

  /** 次要文本色 */
  textSecondary: string;

  /** 弱化文本色（占位符、提示） */
  textMuted: string;
}

/**
 * 根据主题模式返回对应的 token 集合。
 *
 * @param mode - 主题模式，`"light"` 或 `"dark"`
 * @returns 完整的 ThemeTokens 对象
 *
 * @example
 * ```ts
 * const tokens = getThemeTokens("dark");
 * console.log(tokens.bgBase); // "#17171B"
 * console.log(tokens.accent); // "#2EC4A4"
 * ```
 */
export function getThemeTokens(mode: ThemeMode): ThemeTokens {
  if (mode === "dark") {
    return {
      mode,
      accent: "#2EC4A4",
      bgBase: "#17171B",
      bgElevated: "#1F1F26",
      bgSunken: "#121217",
      border: "#2E2E38",
      borderStrong: "#3C3C48",
      textPrimary: "#F2F2F4",
      textSecondary: "#C8C8D0",
      textMuted: "#9A9AA6",
    };
  }

  return {
    mode,
    accent: "#1FA88C",
    bgBase: "#F4F6F5",
    bgElevated: "#FFFFFF",
    bgSunken: "#E8ECEA",
    border: "#D5DCD8",
    borderStrong: "#C2CBC6",
    textPrimary: "#1A1F1D",
    textSecondary: "#3F4A45",
    textMuted: "#7A8680",
  };
}
