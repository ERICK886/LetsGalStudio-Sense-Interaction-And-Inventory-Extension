import { Input, chakra } from "@chakra-ui/react";
import React from "react";
import type { SceneAction, SceneVariableOperand } from "../domain/types";
import type { ThemeTokens } from "../theme/tokens";
import { EditorSelect, EditorSelectOption } from "../editor/ui/editor-select";

type VariableAction = Extract<SceneAction, { type: "editVariable" }>;

function controlStyle(tokens: ThemeTokens): React.CSSProperties {
  return {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "6px 8px",
    borderRadius: 5,
    border: "1px solid " + tokens.border,
    background: tokens.bgSunken,
    color: tokens.textPrimary,
    fontSize: 11,
    fontFamily: "inherit",
  };
}

function OperandField({
  operand, label, tokens, onChange,
}: {
  operand: SceneVariableOperand;
  label: string;
  tokens: ThemeTokens;
  onChange: (operand: SceneVariableOperand) => void;
}): React.ReactElement {
  return (
    <chakra.div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <chakra.span style={{ fontSize: 11, color: tokens.textMuted }}>{label}</chakra.span>
      <chakra.div style={{ display: "grid", gridTemplateColumns: "minmax(90px, 1fr) minmax(0, 2fr)", gap: 6 }}>
        <EditorSelect
          aria-label={label + "类型"}
          value={operand.kind}
          style={controlStyle(tokens)}
          onChange={(event) => onChange({
            kind: event.target.value as SceneVariableOperand["kind"],
            value: event.target.value === "boolean" ? "false" : event.target.value === "number" ? "0" : "",
          })}
        >
          <EditorSelectOption value="number">数字</EditorSelectOption>
          <EditorSelectOption value="string">文本</EditorSelectOption>
          <EditorSelectOption value="boolean">布尔值</EditorSelectOption>
          <EditorSelectOption value="variable">游戏变量</EditorSelectOption>
        </EditorSelect>
        {operand.kind === "boolean" ? (
          <EditorSelect
            aria-label={label + "值"}
            value={operand.value}
            style={controlStyle(tokens)}
            onChange={(event) => onChange({ ...operand, value: event.target.value })}
          >
            <EditorSelectOption value="false">否（false）</EditorSelectOption>
            <EditorSelectOption value="true">是（true）</EditorSelectOption>
          </EditorSelect>
        ) : (
          <Input
            size="xs"
            aria-label={label + "值"}
            type={operand.kind === "number" ? "number" : "text"}
            step={operand.kind === "number" ? "any" : undefined}
            value={operand.value}
            placeholder={operand.kind === "variable" ? "游戏变量名" : "值"}
            style={controlStyle(tokens)}
            onChange={(event) => onChange({ ...operand, value: event.target.value })}
          />
        )}
      </chakra.div>
    </chakra.div>
  );
}

/** 场景点动作链中的游戏变量编辑器。 */
export function VariableActionField({
  action, index, tokens, onChange,
}: {
  action: VariableAction;
  index: number;
  tokens: ThemeTokens;
  onChange: (action: VariableAction) => void;
}): React.ReactElement {
  return (
    <chakra.div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <chakra.label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <chakra.span style={{ fontSize: 11, color: tokens.textMuted }}>目标游戏变量</chakra.span>
        <Input
          size="xs"
          aria-label={"动作 " + (index + 1) + " 目标游戏变量"}
          value={action.target}
          placeholder="例如：score"
          style={controlStyle(tokens)}
          onChange={(event) => onChange({ ...action, target: event.target.value })}
        />
      </chakra.label>
      <chakra.label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <chakra.span style={{ fontSize: 11, color: tokens.textMuted }}>赋值方式</chakra.span>
        <EditorSelect
          aria-label={"动作 " + (index + 1) + " 赋值方式"}
          value={action.assignment}
          style={controlStyle(tokens)}
          onChange={(event) => onChange({
            ...action,
            assignment: event.target.value as VariableAction["assignment"],
          })}
        >
          <EditorSelectOption value="=">设为（=）</EditorSelectOption>
          <EditorSelectOption value="+=">累加（+=）</EditorSelectOption>
          <EditorSelectOption value="-=">扣减（-=）</EditorSelectOption>
          <EditorSelectOption value="*=">乘以（*=）</EditorSelectOption>
          <EditorSelectOption value="/=">除以（/=）</EditorSelectOption>
        </EditorSelect>
      </chakra.label>
      <OperandField
        operand={action.operand}
        label="右值 A"
        tokens={tokens}
        onChange={(operand) => onChange({ ...action, operand })}
      />
      <chakra.label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <chakra.span style={{ fontSize: 11, color: tokens.textMuted }}>右值运算</chakra.span>
        <EditorSelect
          aria-label={"动作 " + (index + 1) + " 右值运算"}
          value={action.binary?.operator ?? ""}
          style={controlStyle(tokens)}
          onChange={(event) => {
            const operator = event.target.value as NonNullable<VariableAction["binary"]>["operator"] | "";
            if (operator === "") {
              const next = { ...action };
              delete next.binary;
              onChange(next);
            } else {
              onChange({
                ...action,
                binary: {
                  operator,
                  operand: action.binary?.operand ?? { kind: "number", value: "0" },
                },
              });
            }
          }}
        >
          <EditorSelectOption value="">无（直接使用 A）</EditorSelectOption>
          <EditorSelectOption value="+">A + B</EditorSelectOption>
          <EditorSelectOption value="-">A - B</EditorSelectOption>
          <EditorSelectOption value="*">A × B</EditorSelectOption>
          <EditorSelectOption value="/">A ÷ B</EditorSelectOption>
        </EditorSelect>
      </chakra.label>
      {action.binary ? (
        <OperandField
          operand={action.binary.operand}
          label="右值 B"
          tokens={tokens}
          onChange={(operand) => onChange({
            ...action,
            binary: { ...action.binary!, operand },
          })}
        />
      ) : null}
      <chakra.span style={{ fontSize: 11, color: tokens.textMuted }}>
        先计算右值，再写入游戏变量。变量变化会更新场景点显示条件。
      </chakra.span>
    </chakra.div>
  );
}
