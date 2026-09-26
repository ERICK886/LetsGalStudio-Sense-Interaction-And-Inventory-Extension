import type { ButtonProps, InputProps } from "@chakra-ui/react";
import type { CSSProperties } from "react";
import { FONT_SIZE_DEFAULT } from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

/** 属性面板的小按钮沿用动作链样式，供条件和动作控件共同使用。 */
export function editorSmallButtonStyle(
  tokens: ThemeTokens,
  options: { danger?: boolean } = {},
): CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${options.danger ? "#C45C5C" : tokens.borderStrong}`,
    background: tokens.bgSunken,
    color: options.danger ? "#E8A0A0" : tokens.textPrimary,
    borderRadius: 5,
    padding: "3px 8px",
    fontSize: 11,
    fontFamily: "inherit",
    cursor: "pointer",
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
}

/** Chakra 控件使用插件的亮暗主题，避免继承宿主的默认配色。 */
export function editorInputProps(tokens: ThemeTokens): InputProps {
  return {
    bg: tokens.bgSunken,
    color: tokens.textPrimary,
    border: "1px solid",
    borderColor: tokens.border,
    borderRadius: "6px",
    h: "32px",
    minW: 0,
    px: "8px",
    fontSize: `${FONT_SIZE_DEFAULT}px`,
    fontFamily: "inherit",
    outline: "none",
    boxShadow: "none",
    _placeholder: { color: tokens.textMuted, opacity: 1 },
    _hover: { borderColor: tokens.borderStrong },
    _focusVisible: {
      outline: "none",
      borderColor: tokens.accent,
      boxShadow: `0 0 0 2px ${tokens.accent}38`,
    },
    _disabled: { opacity: 0.46, cursor: "not-allowed" },
  };
}

export function editorButtonProps(tokens: ThemeTokens): ButtonProps {
  return {
    bg: tokens.bgSunken,
    color: tokens.textPrimary,
    border: "1px solid",
    borderColor: tokens.border,
    borderRadius: "6px",
    h: "32px",
    px: "10px",
    fontSize: `${FONT_SIZE_DEFAULT}px`,
    fontFamily: "inherit",
    fontWeight: 600,
    flexShrink: 0,
    whiteSpace: "nowrap",
    _hover: { bg: tokens.bgElevated, borderColor: tokens.borderStrong },
    _active: { bg: tokens.bgBase, borderColor: tokens.borderStrong },
    _focusVisible: {
      outline: "none",
      borderColor: tokens.accent,
      boxShadow: `0 0 0 2px ${tokens.accent}38`,
    },
    _disabled: { opacity: 0.46, cursor: "not-allowed" },
  };
}
