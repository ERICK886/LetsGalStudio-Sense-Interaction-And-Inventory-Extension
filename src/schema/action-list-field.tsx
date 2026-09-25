/**
 * action-list-field.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 交互点动作列表编辑控件：增删改排序 SceneAction[]。
 * 支持 openScene / giveItem / removeItem / 跳转片段 / continueStory。
 * giveItem：Toast 外观覆盖；片段动作：从工程 story 选择片段（显示名称）。
 */

import React, { useCallback } from "react";
import { defaultElementMotion } from "../domain/motion";
import type {
  ItemDefinition,
  SceneAction,
  SceneDefinition,
  ToastPlacement,
  UiBoxStyle,
  UiTextStyle,
} from "../domain/types";
import { IconLabel } from "../shared/fa-icon";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";
import { ColorPicker } from "./color-picker";
import { DeferredNumberInput } from "./deferred-number-input";
import { FormRenderer } from "./form-renderer";
import { FragmentSelectField } from "./fragment-select-field";
import { motionSection } from "./motion-section";

/**
 * ActionListField 组件属性。
 */
export interface ActionListFieldProps {
  /** 当前动作列表（受控） */
  value: SceneAction[];

  /**
   * 动作列表变更。
   *
   * @param next - 新的 SceneAction 数组
   */
  onChange: (next: SceneAction[]) => void;

  /** 物品库条目（giveItem 下拉） */
  items: readonly ItemDefinition[];

  /** 场景列表（openScene 下拉；用 id 写入 sceneIdOrName） */
  scenes: readonly SceneDefinition[];
}

/** 动作类型选项 */
const ACTION_TYPE_OPTIONS: ReadonlyArray<{
  value: SceneAction["type"];
  label: string;
}> = [
  { value: "none", label: "无" },
  { value: "openScene", label: "打开场景" },
  { value: "giveItem", label: "给予物品" },
  { value: "removeItem", label: "扣除物品" },
  { value: "jumpFragmentReturn", label: "跳转片段（可跳回）" },
  { value: "jumpFragmentGoto", label: "跳转片段（不可跳回）" },
  { value: "continueStory", label: "继续剧情" },
];

/**
 * 创建默认动作（none）。
 *
 * @returns SceneAction
 */
function createDefaultAction(): SceneAction {
  return { type: "none" };
}

/**
 * 按目标类型重置动作载荷（切换 type 时调用）。
 *
 * @param type - 目标动作类型
 * @param items - 物品库（giveItem 默认取首项）
 * @param scenes - 场景列表（openScene 默认取首项）
 * @returns 新的 SceneAction
 */
function createActionOfType(
  type: SceneAction["type"],
  items: readonly ItemDefinition[],
  scenes: readonly SceneDefinition[],
): SceneAction {
  switch (type) {
    case "none":
      return { type: "none" };

    case "openScene":
      return {
        type: "openScene",
        sceneIdOrName: scenes[0]?.id ?? "",
      };

    case "giveItem":
      return {
        type: "giveItem",
        itemId: items[0]?.id ?? "",
        amount: 1,
        toastText: "",
        toastMotion: defaultElementMotion(),
      };

    case "removeItem":
      return {
        type: "removeItem",
        itemId: items[0]?.id ?? "",
        amount: 1,
      };

    case "jumpFragmentReturn":
      return { type: "jumpFragmentReturn", fragmentId: "" };

    case "jumpFragmentGoto":
      return { type: "jumpFragmentGoto", fragmentId: "" };

    case "continueStory":
      return { type: "continueStory" };

    default: {
      const _exhaustive: never = type;

      return _exhaustive;
    }
  }
}

/** giveItem 动作的精确类型别名，便于后续覆盖字段操作 */
type GiveItemAction = Extract<SceneAction, { type: "giveItem" }>;

/** Toast 方位选项；空值表示「跟随全局」 */
const TOAST_PLACEMENT_OPTIONS: ReadonlyArray<{
  value: ToastPlacement | "";
  label: string;
}> = [
  { value: "", label: "跟随全局" },
  { value: "above", label: "上方" },
  { value: "below", label: "下方" },
  { value: "left", label: "左侧" },
  { value: "right", label: "右侧" },
  { value: "center", label: "居中" },
];

/**
 * 更新可选的 toastPlacement；空值时删除字段以跟随全局。
 *
 * @param action - 当前 giveItem 动作
 * @param placement - 新方位；"" 表示删除覆盖
 * @returns 更新后的动作副本（不 mutate 原对象）
 */
function updateToastPlacement(
  action: GiveItemAction,
  placement: ToastPlacement | "",
): GiveItemAction {
  const next = { ...action };

  if (placement === "") {
    delete next.toastPlacement;
  } else {
    next.toastPlacement = placement;
  }

  return next;
}

/**
 * 更新可选的 toast 数字覆盖字段；空或非法时删除字段。
 *
 * @param action - 当前 giveItem 动作
 * @param key - 要更新的字段名
 * @param raw - 输入框原始字符串；空串视为删除
 * @returns 更新后的动作副本
 */
function updateToastNumber(
  action: GiveItemAction,
  key: "toastOffsetX" | "toastOffsetY" | "toastGap",
  raw: string,
): GiveItemAction {
  const next = { ...action };
  const n = raw === "" ? NaN : Number(raw);

  if (!Number.isFinite(n)) {
    delete next[key];
  } else {
    next[key] = n;
  }

  return next;
}

/**
 * 更新 toastStyle 中的单个字段；空或非法时删除该键。
 * 若删除后 toastStyle 为空，则整体移除 toastStyle。
 *
 * @param action - 当前 giveItem 动作
 * @param key - 样式字段名
 * @param value - 新值；空串或 undefined 视为删除
 * @returns 更新后的动作副本
 */
function updateToastStyle(
  action: GiveItemAction,
  key: keyof (UiBoxStyle & UiTextStyle),
  value: string | number | undefined,
): GiveItemAction {
  const next = { ...action };
  const style: Partial<UiBoxStyle & UiTextStyle> = {
    ...(next.toastStyle ?? {}),
  };

  if (value === "" || value === undefined) {
    delete style[key];
  } else {
    (style as Record<string, string | number | undefined>)[key] = value;
  }

  if (Object.keys(style).length === 0) {
    delete next.toastStyle;
  } else {
    next.toastStyle = style;
  }

  return next;
}

/**
 * 小按钮样式。
 *
 * @param tokens - 主题
 * @param options.danger - 危险操作
 * @returns CSSProperties
 */
function smallButtonStyle(
  tokens: ThemeTokens,
  options: { danger?: boolean } = {},
): React.CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${
      options.danger ? "#C45C5C" : tokens.borderStrong
    }`,
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

/**
 * 输入框样式。
 *
 * @param tokens - 主题
 * @returns CSSProperties
 */
function controlStyle(tokens: ThemeTokens): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 8px",
    borderRadius: 5,
    border: `1px solid ${tokens.border}`,
    background: tokens.bgSunken,
    color: tokens.textPrimary,
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
  };
}

/**
 * 不可变替换 index 处动作。
 *
 * @param list - 原列表
 * @param index - 下标
 * @param action - 新动作
 * @returns 新数组
 */
function replaceAt(
  list: SceneAction[],
  index: number,
  action: SceneAction,
): SceneAction[] {
  const next = list.slice();
  next[index] = action;

  return next;
}

/**
 * 交换两下标元素（用于上移/下移）。
 *
 * @param list - 原列表
 * @param from - 源下标
 * @param to - 目标下标
 * @returns 新数组；越界时返回原数组引用
 */
function swapAt(
  list: SceneAction[],
  from: number,
  to: number,
): SceneAction[] {
  if (
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length ||
    from === to
  ) {
    return list;
  }

  const next = list.slice();
  const tmp = next[from]!;
  next[from] = next[to]!;
  next[to] = tmp;

  return next;
}

/**
 * 单条动作编辑卡片。
 *
 * @param props.index - 下标
 * @param props.action - 当前动作
 * @param props.total - 列表总长
 * @param props.items - 物品库
 * @param props.scenes - 场景列表
 * @param props.onReplace - 替换本条
 * @param props.onRemove - 删除本条
 * @param props.onMove - 上移/下移
 * @returns 卡片 UI
 */
function ActionCard({
  index,
  action,
  total,
  items,
  scenes,
  onReplace,
  onRemove,
  onMove,
}: {
  index: number;
  action: SceneAction;
  total: number;
  items: readonly ItemDefinition[];
  scenes: readonly SceneDefinition[];
  onReplace: (action: SceneAction) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}): React.ReactElement {
  const { tokens } = useTheme();

  return (
    <div
      data-testid={`action-card-${index}`}
      style={{
        border: `1px solid ${tokens.border}`,
        borderRadius: 6,
        padding: 10,
        background: tokens.bgBase,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: tokens.textMuted,
            fontWeight: 600,
            minWidth: 28,
          }}
        >
          #{index + 1}
        </span>
        <select
          aria-label={`动作 ${index + 1} 类型`}
          value={action.type}
          style={{ ...controlStyle(tokens), flex: 1, minWidth: 100 }}
          onChange={(e) => {
            onReplace(
              createActionOfType(
                e.target.value as SceneAction["type"],
                items,
                scenes,
              ),
            );
          }}
        >
          {ACTION_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="上移"
          disabled={index === 0}
          style={{
            ...smallButtonStyle(tokens),
            opacity: index === 0 ? 0.4 : 1,
          }}
          onClick={() => onMove(-1)}
        >
          <IconLabel icon="arrow-up" iconSize={11} />
        </button>
        <button
          type="button"
          aria-label="下移"
          disabled={index >= total - 1}
          style={{
            ...smallButtonStyle(tokens),
            opacity: index >= total - 1 ? 0.4 : 1,
          }}
          onClick={() => onMove(1)}
        >
          <IconLabel icon="arrow-down" iconSize={11} />
        </button>
        <button
          type="button"
          aria-label="删除动作"
          style={smallButtonStyle(tokens, { danger: true })}
          onClick={onRemove}
        >
          <IconLabel icon="trash" iconSize={11} />
        </button>
      </div>

      {action.type === "openScene" ? (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>目标场景</span>
            <select
              aria-label={`动作 ${index + 1} 目标场景`}
              value={action.sceneIdOrName}
              style={controlStyle(tokens)}
              onChange={(e) => {
                // 仅替换 sceneIdOrName，保留 pushReturn / returnTarget
                onReplace({ ...action, sceneIdOrName: e.target.value });
              }}
            >
              {scenes.length === 0 ? (
                <option value="">（无场景）</option>
              ) : null}
              {/* 若当前值不在列表中，保留一项以免丢引用 */}
              {action.sceneIdOrName &&
              !scenes.some(
                (s) =>
                  s.id === action.sceneIdOrName ||
                  s.name === action.sceneIdOrName,
              ) ? (
                <option value={action.sceneIdOrName}>
                  {action.sceneIdOrName}（缺失）
                </option>
              ) : null}
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.id}
                </option>
              ))}
            </select>
          </label>

          {/*
           * 压入返回栈：缺省 true（pushReturn 省略）；仅显式 false 时不压栈。
           * checked={pushReturn !== false} 与运行时 openSceneWithReturn 语义一致。
           */}
          <label
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <input
              type="checkbox"
              aria-label={`动作 ${index + 1} 压入返回栈`}
              checked={action.pushReturn !== false}
              onChange={(e) => {
                if (e.target.checked) {
                  const next = { ...action };
                  delete next.pushReturn;
                  onReplace(next);
                } else {
                  onReplace({ ...action, pushReturn: false });
                }
              }}
            />
            <span style={{ fontSize: 11, color: tokens.textMuted }}>
              压入返回栈
            </span>
          </label>

          {/*
           * 返回目标：空 = 来源场景（打开前的 currentSceneId）；
           * 非空时覆盖压栈 id（须为有效场景 id/name）。
           */}
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>
              返回目标
            </span>
            <select
              aria-label={`动作 ${index + 1} 返回目标`}
              value={action.returnTarget ?? ""}
              style={controlStyle(tokens)}
              onChange={(e) => {
                const v = e.target.value;

                if (v === "") {
                  const next = { ...action };
                  delete next.returnTarget;
                  onReplace(next);
                } else {
                  onReplace({ ...action, returnTarget: v });
                }
              }}
            >
              <option value="">（来源场景）</option>
              {/* 若当前 returnTarget 不在列表中，保留一项以免丢引用 */}
              {action.returnTarget &&
              !scenes.some(
                (s) =>
                  s.id === action.returnTarget ||
                  s.name === action.returnTarget,
              ) ? (
                <option value={action.returnTarget}>
                  {action.returnTarget}（缺失）
                </option>
              ) : null}
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.id}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {action.type === "giveItem" ? (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>物品</span>
            <select
              aria-label={`动作 ${index + 1} 物品`}
              data-testid={`action-give-item-${index}`}
              value={action.itemId}
              style={controlStyle(tokens)}
              onChange={(e) => {
                onReplace({ ...action, itemId: e.target.value });
              }}
            >
              {items.length === 0 ? (
                <option value="">（物品库为空）</option>
              ) : null}
              {action.itemId &&
              !items.some((it) => it.id === action.itemId) ? (
                <option value={action.itemId}>
                  {action.itemId}（缺失）
                </option>
              ) : null}
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name || it.id}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>数量</span>
            <DeferredNumberInput
              value={action.amount}
              min={1}
              step={1}
              fallback={1}
              style={controlStyle(tokens)}
              ariaLabel={`动作 ${index + 1} 数量`}
              onCommit={(n) => {
                onReplace({
                  ...action,
                  amount: n !== undefined ? Math.floor(n) : 1,
                });
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>
              提示文案
            </span>
            <input
              type="text"
              value={action.toastText}
              placeholder="空则回退物品名"
              style={controlStyle(tokens)}
              onChange={(e) => {
                onReplace({ ...action, toastText: e.target.value });
              }}
            />
          </label>

          {/* Toast 位置覆盖：空值 = 跟随全局 */}
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>
              Toast 位置
            </span>
            <select
              aria-label={`动作 ${index + 1} Toast 位置`}
              data-testid={`action-toast-placement-${index}`}
              value={action.toastPlacement ?? ""}
              style={controlStyle(tokens)}
              onChange={(e) => {
                onReplace(
                  updateToastPlacement(
                    action,
                    e.target.value as ToastPlacement | "",
                  ),
                );
              }}
            >
              {TOAST_PLACEMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {/* 偏移与间距：留空则删除覆盖字段 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            <label
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <span style={{ fontSize: 11, color: tokens.textMuted }}>
                X 偏移
              </span>
              <DeferredNumberInput
                value={action.toastOffsetX ?? ""}
                step={1}
                allowEmpty
                placeholder="全局"
                style={controlStyle(tokens)}
                ariaLabel={`动作 ${index + 1} Toast X 偏移`}
                onCommit={(n) => {
                  onReplace(
                    updateToastNumber(
                      action,
                      "toastOffsetX",
                      n === undefined ? "" : String(n),
                    ),
                  );
                }}
              />
            </label>
            <label
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <span style={{ fontSize: 11, color: tokens.textMuted }}>
                Y 偏移
              </span>
              <DeferredNumberInput
                value={action.toastOffsetY ?? ""}
                step={1}
                allowEmpty
                placeholder="全局"
                style={controlStyle(tokens)}
                ariaLabel={`动作 ${index + 1} Toast Y 偏移`}
                onCommit={(n) => {
                  onReplace(
                    updateToastNumber(
                      action,
                      "toastOffsetY",
                      n === undefined ? "" : String(n),
                    ),
                  );
                }}
              />
            </label>
            <label
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <span style={{ fontSize: 11, color: tokens.textMuted }}>
                间距
              </span>
              <DeferredNumberInput
                value={action.toastGap ?? ""}
                min={0}
                step={1}
                allowEmpty
                placeholder="全局"
                style={controlStyle(tokens)}
                ariaLabel={`动作 ${index + 1} Toast 间距`}
                onCommit={(n) => {
                  onReplace(
                    updateToastNumber(
                      action,
                      "toastGap",
                      n === undefined ? "" : String(n),
                    ),
                  );
                }}
              />
            </label>
          </div>

          {/* Toast 样式覆盖：与全局样式子集一致 */}
          <div
            style={{
              border: `1px dashed ${tokens.border}`,
              borderRadius: 6,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: tokens.textMuted,
                fontWeight: 600,
              }}
            >
              Toast 样式覆盖（留空跟随全局）
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 8,
              }}
            >
              <label
                style={{ display: "flex", flexDirection: "column", gap: 4 }}
              >
                <span style={{ fontSize: 11, color: tokens.textMuted }}>
                  文字色
                </span>
                <ColorPicker
                  value={action.toastStyle?.color ?? ""}
                  allowAlpha={false}
                  placeholder="#ffffff"
                  tokens={tokens}
                  ariaLabel={`动作 ${index + 1} Toast 文字色`}
                  onChange={(css) => {
                    onReplace(
                      updateToastStyle(action, "color", css || undefined),
                    );
                  }}
                />
              </label>
              <label
                style={{ display: "flex", flexDirection: "column", gap: 4 }}
              >
                <span style={{ fontSize: 11, color: tokens.textMuted }}>
                  背景色
                </span>
                <input
                  type="text"
                  value={action.toastStyle?.background ?? ""}
                  placeholder="#1a1a2e"
                  style={controlStyle(tokens)}
                  onChange={(e) => {
                    onReplace(
                      updateToastStyle(
                        action,
                        "background",
                        e.target.value || undefined,
                      ),
                    );
                  }}
                />
              </label>
              <label
                style={{ display: "flex", flexDirection: "column", gap: 4 }}
              >
                <span style={{ fontSize: 11, color: tokens.textMuted }}>
                  字号
                </span>
                <DeferredNumberInput
                  value={action.toastStyle?.fontSize ?? ""}
                  min={8}
                  max={72}
                  step={1}
                  allowEmpty
                  style={controlStyle(tokens)}
                  ariaLabel={`动作 ${index + 1} Toast 字号`}
                  onCommit={(n) => {
                    onReplace(updateToastStyle(action, "fontSize", n));
                  }}
                />
              </label>
              <label
                style={{ display: "flex", flexDirection: "column", gap: 4 }}
              >
                <span style={{ fontSize: 11, color: tokens.textMuted }}>
                  圆角
                </span>
                <DeferredNumberInput
                  value={action.toastStyle?.borderRadius ?? ""}
                  min={0}
                  max={48}
                  step={1}
                  allowEmpty
                  style={controlStyle(tokens)}
                  ariaLabel={`动作 ${index + 1} Toast 圆角`}
                  onCommit={(n) => {
                    onReplace(updateToastStyle(action, "borderRadius", n));
                  }}
                />
              </label>
              <label
                style={{ display: "flex", flexDirection: "column", gap: 4 }}
              >
                <span style={{ fontSize: 11, color: tokens.textMuted }}>
                  阴影强度
                </span>
                <DeferredNumberInput
                  value={action.toastStyle?.shadow ?? ""}
                  min={0}
                  max={1}
                  step={0.05}
                  allowEmpty
                  style={controlStyle(tokens)}
                  ariaLabel={`动作 ${index + 1} Toast 阴影`}
                  onCommit={(n) => {
                    onReplace(updateToastStyle(action, "shadow", n));
                  }}
                />
              </label>
            </div>
          </div>

          {/* Toast 动画：复用 motionSection 经 FormRenderer 编辑 */}
          <div
            style={{
              border: `1px dashed ${tokens.border}`,
              borderRadius: 6,
              padding: 10,
            }}
          >
            <FormRenderer
              schema={[
                motionSection({
                  keyPrefix: "toastMotion",
                  title: "Toast 动画",
                  sectionId: `toast-motion-${index}`,
                  description: "获得物品提示的入场/退场动画",
                }),
              ]}
              value={action as GiveItemAction & Record<string, unknown>}
              onChange={(next) => {
                onReplace(next as GiveItemAction);
              }}
            />
          </div>
        </>
      ) : null}

      {action.type === "removeItem" ? (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>物品</span>
            <select
              aria-label={`动作 ${index + 1} 扣除物品`}
              data-testid={`action-remove-item-${index}`}
              value={action.itemId}
              style={controlStyle(tokens)}
              onChange={(e) => {
                onReplace({ ...action, itemId: e.target.value });
              }}
            >
              {items.length === 0 ? (
                <option value="">（物品库为空）</option>
              ) : null}
              {action.itemId &&
              !items.some((it) => it.id === action.itemId) ? (
                <option value={action.itemId}>
                  {action.itemId}（缺失）
                </option>
              ) : null}
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name || it.id}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>数量</span>
            <DeferredNumberInput
              value={action.amount}
              min={1}
              step={1}
              fallback={1}
              style={controlStyle(tokens)}
              ariaLabel={`动作 ${index + 1} 扣除数量`}
              onCommit={(n) => {
                onReplace({
                  ...action,
                  amount: n !== undefined ? Math.floor(n) : 1,
                });
              }}
            />
          </label>
          <span style={{ fontSize: 11, color: tokens.textMuted }}>
            持有不足时中心提示「物品不足」，并中断后续动作。
          </span>
        </>
      ) : null}

      {action.type === "continueStory" ? (
        <span style={{ fontSize: 11, color: tokens.textMuted }}>
          关闭场景交互并解除「打开场景交互」阻塞，剧本从下一节点继续。
        </span>
      ) : null}

      {action.type === "jumpFragmentReturn" ||
      action.type === "jumpFragmentGoto" ? (
        <FragmentSelectField
          fragmentId={action.fragmentId}
          index={index}
          tokens={tokens}
          controlStyle={controlStyle(tokens)}
          onChange={(fragmentId, chapterId) => {
            const chapter =
              chapterId !== undefined && chapterId.trim().length > 0
                ? chapterId
                : undefined;

            if (action.type === "jumpFragmentReturn") {
              onReplace(
                chapter === undefined
                  ? { type: "jumpFragmentReturn", fragmentId }
                  : {
                      type: "jumpFragmentReturn",
                      fragmentId,
                      chapterId: chapter,
                    },
              );

              return;
            }

            onReplace(
              chapter === undefined
                ? { type: "jumpFragmentGoto", fragmentId }
                : {
                    type: "jumpFragmentGoto",
                    fragmentId,
                    chapterId: chapter,
                  },
            );
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * 动作列表编辑器：增删改排序 SceneAction[]。
 *
 * @param props.value - 当前动作列表
 * @param props.onChange - 列表变更回调
 * @param props.items - 物品库（giveItem 下拉）
 * @param props.scenes - 场景列表（openScene 下拉）
 * @returns 动作列表 UI
 *
 * @example
 * ```tsx
 * <ActionListField
 *   value={hotspot.actions}
 *   onChange={(actions) => onHotspotChange({ ...hotspot, actions })}
 *   items={itemsLibrary.items}
 *   scenes={scenesLibrary.scenes}
 * />
 * ```
 */
export function ActionListField({
  value,
  onChange,
  items,
  scenes,
}: ActionListFieldProps): React.ReactElement {
  const { tokens } = useTheme();

  const handleAdd = useCallback(() => {
    onChange([...value, createDefaultAction()]);
  }, [value, onChange]);

  const handleReplace = useCallback(
    (index: number, action: SceneAction) => {
      onChange(replaceAt(value, index, action));
    },
    [value, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange],
  );

  const handleMove = useCallback(
    (index: number, delta: -1 | 1) => {
      onChange(swapAt(value, index, index + delta));
    },
    [value, onChange],
  );

  return (
    <section
      data-testid="action-list-field"
      style={{
        marginBottom: 14,
        paddingBottom: 8,
        borderBottom: `1px solid ${tokens.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 8,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: FONT_SIZE_TITLE,
            fontWeight: 650,
            color: tokens.textPrimary,
          }}
        >
          动作
        </h3>
        <button
          type="button"
          data-testid="action-list-add"
          style={smallButtonStyle(tokens)}
          onClick={handleAdd}
        >
          <IconLabel icon="plus" iconSize={11}>
            添加
          </IconLabel>
        </button>
      </div>

      {value.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: FONT_SIZE_DEFAULT,
            color: tokens.textMuted,
          }}
        >
          暂无动作。点击「添加」配置打开场景 / 给予物品 / 跳转片段。
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {value.map((action, index) => (
            <ActionCard
              key={index}
              index={index}
              action={action}
              total={value.length}
              items={items}
              scenes={scenes}
              onReplace={(next) => handleReplace(index, next)}
              onRemove={() => handleRemove(index)}
              onMove={(delta) => handleMove(index, delta)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
