/**
 * ui-overlay-layer.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.1.0
 *
 * 渲染 UI 区块自由图层（编辑预览与运行时共用）。
 */

import React, { useMemo, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  applyUiBoxStyle,
  applyUiTextStyle,
} from "../domain/ui-style";
import {
  sortOverlaysByZ,
  splitOverlayOptions,
} from "../domain/ui-overlay";
import type { UiOverlayElement, UiOverlayRole } from "../domain/types";
import { FaIcon } from "../shared/fa-icon";
import { resolveAssetUrl } from "../shared/resolve-asset-url";
import { useUiButtonSkin } from "./use-ui-button-skin";

/**
 * UiOverlayLayer 属性。
 */
export interface UiOverlayLayerProps {
  /** 图层列表 */
  overlays: readonly UiOverlayElement[];

  /**
   * 坐标原点偏移（紧凑 HUD 宿主时为包围盒左上角）。
   * @default 0
   */
  originX?: number;

  /** @default 0 */
  originY?: number;

  /**
   * 编辑器模式：禁用真实输入，点击只用于选中（由外层处理）。
   * @default false
   */
  editorMode?: boolean;

  /**
   * 编辑器：指针按下某图层。
   *
   * @param overlayId - 元素 id
   * @param event - 指针事件
   */
  onOverlayPointerDown?: (
    overlayId: string,
    event: React.PointerEvent,
  ) => void;

  /**
   * 运行时：按钮 role 触发（非 editorMode）。
   *
   * @param role - 非 none 的角色
   * @param el - 图层
   */
  onOverlayAction?: (role: UiOverlayRole, el: UiOverlayElement) => void;

  /** 运行时隐藏这些 role 的图层 */
  hiddenRoles?: readonly UiOverlayRole[];

  /** 运行时禁用这些 role 的按钮 */
  disabledRoles?: readonly UiOverlayRole[];

  /** 按 role 覆盖显示文案（如合成「原料不足」） */
  labelByRole?: Partial<Record<UiOverlayRole, string>>;
}

/**
 * 单图层渲染（内部可含 hook）。
 */
function OverlayItem({
  el,
  originX,
  originY,
  editorMode,
  onOverlayPointerDown,
  onOverlayAction,
  disabledRoles,
  labelByRole,
}: {
  el: UiOverlayElement;
  originX: number;
  originY: number;
  editorMode: boolean;
  onOverlayPointerDown?: UiOverlayLayerProps["onOverlayPointerDown"];
  onOverlayAction?: UiOverlayLayerProps["onOverlayAction"];
  disabledRoles?: readonly UiOverlayRole[];
  labelByRole?: Partial<Record<UiOverlayRole, string>>;
}): React.ReactElement {
  const ctx = useExtensionContext();
  const resolve = ctx.asset?.resolve?.bind(ctx.asset);
  const skin = useUiButtonSkin(el.skin ?? {});
  const [on, setOn] = useState(el.props.initialOn !== false);
  const [value, setValue] = useState(el.props.initialValue ?? 60);
  const [tabIndex, setTabIndex] = useState(el.props.initialIndex ?? 0);
  const [selectIndex, setSelectIndex] = useState(el.props.initialIndex ?? 0);

  const boxCss = applyUiBoxStyle(el.style);
  const textCss = applyUiTextStyle(el.style);
  const options = useMemo(
    () => splitOverlayOptions(el.props.options),
    [el.props.options],
  );

  const assetUrl = (uri: string | undefined): string =>
    uri ? resolveAssetUrl(uri, resolve) : "";

  const transformParts = [
    el.rotation !== 0 ? `rotate(${el.rotation}deg)` : "",
    el.flipH ? "scaleX(-1)" : "",
    el.flipV ? "scaleY(-1)" : "",
  ].filter(Boolean);

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: el.rect.x - originX,
    top: el.rect.y - originY,
    width: el.rect.w,
    height: el.rect.h,
    boxSizing: "border-box",
    opacity: el.opacity,
    transform: transformParts.length > 0 ? transformParts.join(" ") : undefined,
    transformOrigin: "center center",
    zIndex: el.zIndex,
    pointerEvents: editorMode ? "auto" : el.kind === "mask" ? "none" : "auto",
    overflow: "hidden",
  };

  const cssId = `ui-ov-css-${el.id}`;

  const handlePointerDown = (event: React.PointerEvent): void => {
    if (onOverlayPointerDown) {
      event.stopPropagation();
      onOverlayPointerDown(el.id, event);
    }
  };

  const role = el.role ?? "none";
  const roleLabel = labelByRole?.[role];
  const iconName = el.props.icon?.trim() || "";
  const hasIcon = iconName.length > 0;
  /**
   * 文案解析：`props.text` 一旦存在（含空串）即为权威，允许纯图标按钮；
   * 非空配置下才套用 labelByRole（如模式切换「合成/返回道具」）。
   */
  const configuredLabel =
    typeof el.props.text === "string"
      ? el.props.text.trim()
      : typeof el.style.label === "string"
        ? el.style.label.trim()
        : "";
  const labelText =
    configuredLabel.length === 0
      ? ""
      : typeof roleLabel === "string" && roleLabel.trim().length > 0
        ? roleLabel.trim()
        : configuredLabel;
  const roleDisabled =
    !editorMode &&
    role !== "none" &&
    (disabledRoles ?? []).includes(role);

  let body: React.ReactNode = null;

  switch (el.kind) {
    case "mask":
    case "rect":
      body = (
        <div
          style={{
            width: "100%",
            height: "100%",
            ...boxCss,
          }}
        />
      );
      break;
    case "text":
      body = (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            gap: hasIcon && labelText ? 8 : 0,
            whiteSpace: "pre-wrap",
            ...textCss,
          }}
        >
          {hasIcon ? <FaIcon name={iconName} /> : null}
          {labelText || (!hasIcon ? (el.props.text ?? el.style.label ?? "") : null)}
        </div>
      );
      break;
    case "image": {
      const src = assetUrl(el.props.asset);
      body = src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            ...boxCss,
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "rgba(255,255,255,0.35)",
            fontSize: 18,
            border: "1px dashed rgba(255,255,255,0.2)",
            ...boxCss,
          }}
        >
          <FaIcon name="image" style="regular" />
        </div>
      );
      break;
    }
    case "button":
      body = (
        <button
          type="button"
          disabled={editorMode || roleDisabled}
          data-overlay-role={role}
          {...(editorMode || roleDisabled ? {} : skin.pointerHandlers)}
          onClick={
            editorMode || role === "none" || roleDisabled
              ? undefined
              : (event) => {
                  event.stopPropagation();
                  onOverlayAction?.(role, el);
                }
          }
          style={{
            width: "100%",
            height: "100%",
            appearance: "none",
            cursor:
              editorMode || roleDisabled ? "default" : "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: hasIcon && labelText ? 8 : 0,
            border: "none",
            opacity: roleDisabled ? 0.7 : undefined,
            ...boxCss,
            ...textCss,
            ...skin.backgroundImageStyle,
          }}
        >
          {hasIcon ? <FaIcon name={iconName} /> : null}
          {labelText ? <span>{labelText}</span> : null}
        </button>
      );
      break;
    case "line": {
      const horizontal = el.rect.w >= el.rect.h;
      const thickness = el.props.thickness ?? 2;
      const color = el.style.color || el.style.borderColor || "#f5f5f0";
      body = (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: horizontal ? "100%" : thickness,
              height: horizontal ? thickness : "100%",
              background: color,
              borderStyle: el.props.lineStyle ?? "solid",
              opacity: 1,
            }}
          />
        </div>
      );
      break;
    }
    case "select": {
      const current = options[selectIndex] ?? options[0] ?? "选项";
      body = editorMode ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            ...boxCss,
            ...textCss,
          }}
        >
          {current}
        </div>
      ) : (
        <select
          value={String(selectIndex)}
          onChange={(e) => setSelectIndex(Number(e.target.value))}
          style={{
            width: "100%",
            height: "100%",
            appearance: "none",
            border: "none",
            fontFamily: "inherit",
            padding: "0 12px",
            ...boxCss,
            ...textCss,
          }}
        >
          {options.map((opt, i) => (
            <option key={`${opt}-${i}`} value={String(i)}>
              {opt}
            </option>
          ))}
        </select>
      );
      break;
    }
    case "switch": {
      const onSrc = assetUrl(el.props.onAsset);
      const offSrc = assetUrl(el.props.offAsset);
      const src = on ? onSrc || offSrc : offSrc || onSrc;
      body = (
        <button
          type="button"
          disabled={editorMode}
          aria-pressed={on}
          onClick={() => {
            if (!editorMode) setOn((v) => !v);
          }}
          style={{
            width: "100%",
            height: "100%",
            appearance: "none",
            border: "none",
            borderRadius: 999,
            cursor: editorMode ? "default" : "pointer",
            background: on ? "#64e0d0" : "rgba(255,255,255,0.15)",
            backgroundImage: src ? `url("${src}")` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            position: "relative",
            ...boxCss,
          }}
        >
          {!src ? (
            <span
              style={{
                position: "absolute",
                top: 4,
                bottom: 4,
                width: "42%",
                borderRadius: 999,
                background: "#fff",
                left: on ? "52%" : "6%",
                transition: "left 160ms ease",
              }}
            />
          ) : null}
        </button>
      );
      break;
    }
    case "slider": {
      body = (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 8px",
            ...boxCss,
          }}
        >
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            disabled={editorMode}
            onChange={(e) => setValue(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          {el.props.showValue !== false ? (
            <span style={{ ...textCss, minWidth: 28 }}>{Math.round(value)}</span>
          ) : null}
        </div>
      );
      break;
    }
    case "checkbox": {
      const checkedSrc = assetUrl(el.props.checkedAsset);
      const uncheckedSrc = assetUrl(el.props.uncheckedAsset);
      const src = on ? checkedSrc || uncheckedSrc : uncheckedSrc || checkedSrc;
      body = (
        <button
          type="button"
          disabled={editorMode}
          onClick={() => {
            if (!editorMode) setOn((v) => !v);
          }}
          style={{
            width: "100%",
            height: "100%",
            appearance: "none",
            border: "none",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: editorMode ? "default" : "pointer",
            fontFamily: "inherit",
            padding: "0 8px",
            ...textCss,
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.35)",
              background: on ? "#64e0d0" : "transparent",
              backgroundImage: src ? `url("${src}")` : undefined,
              backgroundSize: "cover",
              flex: "0 0 auto",
            }}
          />
          <span>{el.props.text ?? "勾选项"}</span>
        </button>
      );
      break;
    }
    case "input":
      body = (
        <input
          type="text"
          disabled={editorMode}
          placeholder={el.props.placeholder ?? "请输入…"}
          defaultValue={el.props.text ?? ""}
          maxLength={
            el.props.maxLength && el.props.maxLength > 0
              ? el.props.maxLength
              : undefined
          }
          style={{
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            border: "none",
            padding: "0 12px",
            fontFamily: "inherit",
            ...boxCss,
            ...textCss,
          }}
        />
      );
      break;
    case "tabs": {
      const tabs = options.length > 0 ? options : ["页签一", "页签二"];
      const safeIndex = Math.min(tabIndex, tabs.length - 1);
      body = (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            ...boxCss,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: el.props.tabGap ?? 8,
              padding: 8,
              flex: "0 0 auto",
            }}
          >
            {tabs.map((tab, i) => (
              <button
                key={`${tab}-${i}`}
                type="button"
                disabled={editorMode}
                onClick={() => {
                  if (!editorMode) setTabIndex(i);
                }}
                style={{
                  appearance: "none",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 14px",
                  cursor: editorMode ? "default" : "pointer",
                  fontFamily: "inherit",
                  background:
                    i === safeIndex ? "#64e0d033" : "rgba(255,255,255,0.06)",
                  color: textCss.color ?? "#f2f5f7",
                  fontSize: textCss.fontSize,
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <div
            style={{
              flex: 1,
              margin: 8,
              marginTop: 0,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)",
              display: "grid",
              placeItems: "center",
              color: "rgba(255,255,255,0.4)",
              fontSize: 13,
            }}
          >
            {tabs[safeIndex] ?? ""}
          </div>
        </div>
      );
      break;
    }
    default:
      body = null;
  }

  return (
    <>
      {el.customCss.trim() ? (
        <style>{`[data-ui-overlay-id="${el.id}"] { ${el.customCss} }`}</style>
      ) : null}
      <div
        data-ui-overlay-id={el.id}
        data-testid={`ui-overlay-${el.kind}`}
        data-overlay-css={cssId}
        onPointerDown={handlePointerDown}
        style={baseStyle}
      >
        {body}
      </div>
    </>
  );
}

/**
 * 自由图层叠层。
 *
 * @param props - UiOverlayLayerProps
 * @returns React 元素
 */
export function UiOverlayLayer({
  overlays,
  originX = 0,
  originY = 0,
  editorMode = false,
  onOverlayPointerDown,
  onOverlayAction,
  hiddenRoles,
  disabledRoles,
  labelByRole,
}: UiOverlayLayerProps): React.ReactElement | null {
  const sorted = useMemo(() => {
    const hidden = new Set(hiddenRoles ?? []);
    const list =
      hidden.size === 0
        ? overlays
        : overlays.filter((el) => !hidden.has(el.role ?? "none"));

    return sortOverlaysByZ(list);
  }, [hiddenRoles, overlays]);

  if (sorted.length === 0) {
    return null;
  }

  return (
    <>
      {sorted.map((el) => (
        <OverlayItem
          key={el.id}
          el={el}
          originX={originX}
          originY={originY}
          editorMode={editorMode}
          onOverlayPointerDown={onOverlayPointerDown}
          onOverlayAction={onOverlayAction}
          disabledRoles={disabledRoles}
          labelByRole={labelByRole}
        />
      ))}
    </>
  );
}
