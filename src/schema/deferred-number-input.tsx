/**
 * deferred-number-input.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 延迟提交的数字输入：聚焦期间只改草稿，失焦 / Enter 后再按 min/max 钳制并回调。
 * 避免「输入 300 时先出现 3 被立刻钳回 min」的问题。
 */

import { Input, chakra } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import { clampNumberFieldValue } from "./form-renderer";

/**
 * DeferredNumberInput 属性。
 */
export interface DeferredNumberInputProps {
  /** 当前已提交的数值；可选字段未设时用空串展示 */
  value: number | "";

  /**
   * 提交回调。
   *
   * @param next - 钳制后的数；当 `allowEmpty` 且草稿为空时为 `undefined`
   */
  onCommit: (next: number | undefined) => void;

  /** 下限（可选） */
  min?: number;

  /** 上限（可选） */
  max?: number;

  /** step，默认 1 */
  step?: number;

  /**
   * 允许空草稿：失焦时空串提交 `undefined`（用于「跟随全局」类可选覆盖）。
   * 默认 false：空串回退到 `fallback`。
   */
  allowEmpty?: boolean;

  /**
   * 非法 / 空草稿（且不允许空）时的回退值。
   * 默认：若有合法 `value` 用 value，否则用 `min ?? 0`。
   */
  fallback?: number;

  /** input id */
  id?: string;

  /** data-testid */
  testId?: string;

  /** placeholder */
  placeholder?: string;

  /** 内联样式 */
  style?: React.CSSProperties;

  /** aria-label */
  ariaLabel?: string;
}

/**
 * 延迟钳制的数字输入框。
 *
 * @param props - DeferredNumberInputProps
 * @returns input 节点
 *
 * @example
 * ```tsx
 * <DeferredNumberInput
 *   value={action.amount}
 *   min={1}
 *   fallback={1}
 *   onCommit={(n) => onReplace({ ...action, amount: n ?? 1 })}
 * />
 * ```
 *
 * @remarks
 * 不在 onChange 里调用 onCommit，因此父级 normalize/clamp 不会打断中间输入。
 */
export function DeferredNumberInput(
  props: DeferredNumberInputProps,
): React.ReactElement {
  const {
    value,
    onCommit,
    min,
    max,
    step = 1,
    allowEmpty = false,
    fallback,
    id,
    testId,
    placeholder,
    style,
    ariaLabel,
  } = props;

  const committedFallback =
    fallback ??
    (typeof value === "number" && Number.isFinite(value)
      ? value
      : min !== undefined && Number.isFinite(min)
        ? min
        : 0);

  const committedText =
    typeof value === "number" && Number.isFinite(value) ? String(value) : "";

  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(committedText);

  useEffect(() => {
    if (!focused) {
      setDraft(committedText);
    }
  }, [committedText, focused]);

  /**
   * 失焦提交：空串按 allowEmpty 决定；否则钳制。
   */
  const commit = (): void => {
    setFocused(false);

    const trimmed = draft.trim();

    if (allowEmpty && trimmed.length === 0) {
      setDraft("");
      onCommit(undefined);

      return;
    }

    const next = clampNumberFieldValue(
      draft,
      { min, max },
      committedFallback,
    );

    setDraft(String(next));
    onCommit(next);
  };

  return (
    <Input size="xs"
      id={id}
      data-testid={testId}
      type="number"
      step={step}
      value={focused ? draft : committedText}
      placeholder={placeholder}
      aria-label={ariaLabel}
      style={style}
      onFocus={() => {
        setFocused(true);
        setDraft(committedText);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={() => {
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
    />
  );
}
