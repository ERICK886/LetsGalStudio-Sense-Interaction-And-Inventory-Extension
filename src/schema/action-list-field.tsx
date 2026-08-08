/**
 * action-list-field.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 交互点动作列表编辑控件：增删改排序 SceneAction[]。
 * giveItem 的物品下拉选项来自物品库。
 */

import React, { useCallback } from "react";
import { defaultElementMotion } from "../domain/motion";
import type {
  ItemDefinition,
  SceneAction,
  SceneDefinition,
} from "../domain/types";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";

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

    default: {
      const _exhaustive: never = type;

      return _exhaustive;
    }
  }
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
          ↑
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
          ↓
        </button>
        <button
          type="button"
          aria-label="删除动作"
          style={smallButtonStyle(tokens, { danger: true })}
          onClick={onRemove}
        >
          删
        </button>
      </div>

      {action.type === "openScene" ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: tokens.textMuted }}>目标场景</span>
          <select
            aria-label={`动作 ${index + 1} 目标场景`}
            value={action.sceneIdOrName}
            style={controlStyle(tokens)}
            onChange={(e) => {
              onReplace({ type: "openScene", sceneIdOrName: e.target.value });
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
            <input
              type="number"
              min={1}
              step={1}
              value={action.amount}
              style={controlStyle(tokens)}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                onReplace({
                  ...action,
                  amount: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1,
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
        </>
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
          添加
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
          暂无动作。点击「添加」配置 openScene / giveItem。
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
