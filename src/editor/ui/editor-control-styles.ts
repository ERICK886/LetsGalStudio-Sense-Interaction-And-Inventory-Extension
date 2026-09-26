import type { ButtonProps, InputProps } from "@chakra-ui/react";
import { FONT_SIZE_DEFAULT } from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

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
