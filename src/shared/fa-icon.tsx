/**
 * fa-icon.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.1.0
 *
 * Font Awesome 图标组件（默认 solid）。
 */

import React from "react";
import {
  ensureFontAwesomeCss,
  normalizeFaIconName,
} from "./font-awesome";

/** 图标样式族 */
export type FaIconStyle = "solid" | "regular" | "brands";

/**
 * FaIcon 属性。
 */
export interface FaIconProps {
  /**
   * 图标名（不含 `fa-`），如 `xmark`、`image`。
   */
  name: string;

  /** @default "solid" */
  style?: FaIconStyle;

  /** 额外 class */
  className?: string;

  /** 行内样式 */
  css?: React.CSSProperties;

  /** 无障碍标题；缺省 aria-hidden */
  title?: string;
}

const STYLE_CLASS: Record<FaIconStyle, string> = {
  solid: "fa-solid",
  regular: "fa-regular",
  brands: "fa-brands",
};

/**
 * @param props - FaIconProps
 * @returns `<i>` 图标；非法 name 时 null
 *
 * @example
 * ```tsx
 * <FaIcon name="xmark" />
 * <FaIcon name="image" style="regular" />
 * ```
 */
export function FaIcon({
  name,
  style = "solid",
  className,
  css,
  title,
}: FaIconProps): React.ReactElement | null {
  ensureFontAwesomeCss();

  const icon = normalizeFaIconName(name);

  if (icon.length === 0) {
    return null;
  }

  const classes = [STYLE_CLASS[style], `fa-${icon}`];

  if (className && className.trim().length > 0) {
    classes.push(className.trim());
  }

  return (
    <i
      className={classes.join(" ")}
      style={css}
      title={title}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    />
  );
}

/**
 * 图标 + 可选文案（用于工具栏 / 列表按钮）。
 */
export interface IconLabelProps {
  /** FA 图标名（不含 fa-） */
  icon: string;

  /** 文案；仅图标时省略 */
  children?: React.ReactNode;

  /** 图标字号，默认 12 */
  iconSize?: number;
}

/**
 * @param props - IconLabelProps
 * @returns 图标与文案片段
 *
 * @example
 * ```tsx
 * <button type="button"><IconLabel icon="plus">新建</IconLabel></button>
 * ```
 */
export function IconLabel({
  icon,
  children,
  iconSize = 12,
}: IconLabelProps): React.ReactElement {
  return (
    <>
      <FaIcon name={icon} css={{ fontSize: iconSize, lineHeight: 1 }} />
      {children !== undefined && children !== null && children !== "" ? (
        <span>{children}</span>
      ) : null}
    </>
  );
}
