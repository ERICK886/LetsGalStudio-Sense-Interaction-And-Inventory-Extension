/**
 * design-resolution-menu.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 编辑器顶栏：设计分辨率下拉（预设 + 自定义弹窗）。
 * 自定义宽高草稿不挂 HTML min/max，保存时再 normalizeDesignSize。
 */

import { chakra } from "@chakra-ui/react";
import React, { useEffect, useId, useRef, useState } from "react";
import {
  DESIGN_RESOLUTION_PRESETS,
  DESIGN_SIZE_MAX,
  DESIGN_SIZE_MIN,
  formatDesignSizeLabel,
  matchesPreset,
  normalizeDesignSize,
  type DesignSize,
} from "../../domain/design-resolution";
import { IconLabel } from "../../shared/fa-icon";
import {
  FONT_SIZE_DEFAULT,
  useTheme,
} from "../../theme/theme-provider";

/**
 * DesignResolutionMenu 属性。
 */
export interface DesignResolutionMenuProps {
  /** 当前设计尺寸 */
  size: DesignSize;

  /**
   * 选择预设或自定义后写回。
   *
   * @param next - 新尺寸
   */
  onChange: (next: DesignSize) => void;
}

/**
 * 设计分辨率下拉菜单。
 *
 * @param props - size / onChange
 * @returns 顶栏控件
 *
 * @example
 * ```tsx
 * <DesignResolutionMenu
 *   size={{ width: 1920, height: 1080 }}
 *   onChange={setSize}
 * />
 * ```
 */
export function DesignResolutionMenu({
  size,
  onChange,
}: DesignResolutionMenuProps): React.ReactElement {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftW, setDraftW] = useState(String(size.width));
  const [draftH, setDraftH] = useState(String(size.height));
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    /**
     * 点击外部关闭菜单。
     *
     * @param ev - 鼠标事件
     */
    const onDoc = (ev: MouseEvent): void => {
      if (
        rootRef.current !== null &&
        !rootRef.current.contains(ev.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDoc);

    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const buttonStyle: React.CSSProperties = {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: tokens.bgElevated,
    color: tokens.textPrimary,
    fontFamily: "inherit",
    fontSize: FONT_SIZE_DEFAULT,
    fontWeight: 600,
    cursor: "pointer",
  };

  /**
   * 应用自定义宽高并关闭弹窗。
   */
  const applyCustom = (): void => {
    const next = normalizeDesignSize(Number(draftW), Number(draftH));

    onChange(next);
    setCustomOpen(false);
    setOpen(false);
  };

  return (
    <chakra.div ref={rootRef} style={{ position: "relative" }}>
      <chakra.button
        type="button"
        data-testid="design-resolution-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={buttonStyle}
      >
        <IconLabel icon="display">{formatDesignSizeLabel(size)}</IconLabel>
        <IconLabel icon="chevron-down" iconSize={10} />
      </chakra.button>

      {open ? (
        <chakra.div
          role="listbox"
          data-testid="design-resolution-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            minWidth: 240,
            maxHeight: 320,
            overflow: "auto",
            padding: 6,
            borderRadius: 8,
            border: `1px solid ${tokens.borderStrong}`,
            background: tokens.bgElevated,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {DESIGN_RESOLUTION_PRESETS.map((preset) => {
            const active = matchesPreset(size, preset);

            return (
              <chakra.button
                key={`${preset.width}x${preset.height}`}
                type="button"
                role="option"
                aria-selected={active}
                data-testid={`design-resolution-${preset.width}x${preset.height}`}
                onClick={() => {
                  onChange({ width: preset.width, height: preset.height });
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  appearance: "none",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 10px",
                  background: active ? `${tokens.accent}22` : "transparent",
                  color: tokens.textPrimary,
                  fontFamily: "inherit",
                  fontSize: FONT_SIZE_DEFAULT,
                  cursor: "pointer",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {preset.label}
              </chakra.button>
            );
          })}

          <chakra.button
            type="button"
            data-testid="design-resolution-custom"
            onClick={() => {
              setDraftW(String(size.width));
              setDraftH(String(size.height));
              setCustomOpen(true);
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              appearance: "none",
              border: "none",
              borderTop: `1px solid ${tokens.border}`,
              borderRadius: 6,
              marginTop: 4,
              padding: "8px 10px",
              background: "transparent",
              color: tokens.accent,
              fontFamily: "inherit",
              fontSize: FONT_SIZE_DEFAULT,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <IconLabel icon="sliders">自定义…</IconLabel>
          </chakra.button>
        </chakra.div>
      ) : null}

      {customOpen ? (
        <>
          <chakra.div
            data-testid="design-resolution-custom-backdrop"
            onClick={() => setCustomOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 60,
              background: "rgba(0,0,0,0.45)",
            }}
          />
          <chakra.div
            role="dialog"
            aria-labelledby={titleId}
            style={{
              position: "fixed",
              zIndex: 61,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 320,
              padding: 20,
              borderRadius: 10,
              border: `1px solid ${tokens.borderStrong}`,
              background: tokens.bgElevated,
              color: tokens.textPrimary,
              boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
            }}
          >
            <chakra.div
              id={titleId}
              style={{ fontWeight: 650, marginBottom: 14, fontSize: 14 }}
            >
              自定义设计分辨率
            </chakra.div>
            <chakra.div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <chakra.label style={{ flex: 1, fontSize: FONT_SIZE_DEFAULT }}>
                <chakra.div style={{ marginBottom: 4, color: tokens.textMuted }}>
                  宽（{DESIGN_SIZE_MIN}–{DESIGN_SIZE_MAX}）
                </chakra.div>
                <chakra.input
                  data-testid="design-resolution-custom-width"
                  type="number"
                  value={draftW}
                  onChange={(e) => setDraftW(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: `1px solid ${tokens.border}`,
                    background: tokens.bgSunken,
                    color: tokens.textPrimary,
                    fontFamily: "inherit",
                  }}
                />
              </chakra.label>
              <chakra.label style={{ flex: 1, fontSize: FONT_SIZE_DEFAULT }}>
                <chakra.div style={{ marginBottom: 4, color: tokens.textMuted }}>
                  高（{DESIGN_SIZE_MIN}–{DESIGN_SIZE_MAX}）
                </chakra.div>
                <chakra.input
                  data-testid="design-resolution-custom-height"
                  type="number"
                  value={draftH}
                  onChange={(e) => setDraftH(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: `1px solid ${tokens.border}`,
                    background: tokens.bgSunken,
                    color: tokens.textPrimary,
                    fontFamily: "inherit",
                  }}
                />
              </chakra.label>
            </chakra.div>
            <chakra.div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <chakra.button
                type="button"
                onClick={() => setCustomOpen(false)}
                style={buttonStyle}
              >
                取消
              </chakra.button>
              <chakra.button
                type="button"
                data-testid="design-resolution-custom-save"
                onClick={applyCustom}
                style={{
                  ...buttonStyle,
                  borderColor: tokens.accent,
                  background: tokens.accent,
                  color: "#0B1210",
                }}
              >
                保存
              </chakra.button>
            </chakra.div>
          </chakra.div>
        </>
      ) : null}
    </chakra.div>
  );
}
