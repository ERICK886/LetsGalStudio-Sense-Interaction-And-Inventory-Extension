import { EditorSelect, EditorSelectOption } from "../ui/editor-select";
import { Button, Input, chakra } from "@chakra-ui/react";
import React from "react";
import type { HotspotCondition, HotspotConditionGroup } from "../../domain/types";
import { useTheme } from "../../theme/theme-provider";
import { IconLabel } from "../../shared/fa-icon";
import { editorSmallButtonStyle } from "../ui/editor-control-styles";

interface Props {
  value: HotspotConditionGroup | undefined;
  onChange: (next: HotspotConditionGroup | undefined) => void;
}

const newCondition = (): HotspotCondition => ({
  source: "game", target: "", valueType: "string", operator: "eq", value: "",
});

const operatorOptions = (type: HotspotCondition["valueType"]) => {
  if (type === "number") return [
    ["eq", "等于"], ["neq", "不等于"], ["gt", "大于"], ["gte", "大于等于"],
    ["lt", "小于"], ["lte", "小于等于"],
  ] as const;
  if (type === "bool") return [
    ["eq", "等于"], ["neq", "不等于"], ["truthy", "为真"], ["falsy", "为假"],
  ] as const;
  return [["eq", "等于"], ["neq", "不等于"]] as const;
};

export function HotspotConditionEditor({ value, onChange }: Props): React.ReactElement {
  const { tokens } = useTheme();
  const fieldStyle: React.CSSProperties = {
    minHeight: 28, width: "100%", border: "1px solid " + tokens.border,
    borderRadius: 4, background: tokens.bgElevated, color: tokens.textPrimary,
    padding: "4px 7px", fontSize: 12,
  };
  const buttonStyle = editorSmallButtonStyle(tokens);
  const update = (index: number, next: HotspotCondition) => {
    if (!value) return;
    onChange({ ...value, conditions: value.conditions.map((entry, i) => i === index ? next : entry) });
  };
  const remove = (index: number) => {
    if (!value) return;
    const conditions = value.conditions.filter((_, i) => i !== index);
    onChange(conditions.length ? { ...value, conditions } : undefined);
  };

  return (
    <chakra.section aria-label="显示条件" style={{
      borderTop: "1px solid " + tokens.border, marginTop: 16, paddingTop: 14,
      color: tokens.textPrimary,
    }}>
      <chakra.div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <chakra.span style={{ fontSize: 13, fontWeight: 650 }}>显示条件</chakra.span>
        {value ? (
          <Button size="xs" variant="plain" type="button" style={buttonStyle} onClick={() => onChange(undefined)}>
            <IconLabel icon="xmark" iconSize={11}>清除条件</IconLabel>
          </Button>
        ) : (
          <Button size="xs" variant="plain" type="button" aria-label="添加条件" data-testid="hotspot-condition-add"
            style={buttonStyle} onClick={() => onChange({ logic: "all", conditions: [newCondition()] })}>
            <IconLabel icon="plus" iconSize={11}>添加</IconLabel>
          </Button>
        )}
      </chakra.div>
      <chakra.p style={{ margin: "7px 0 10px", fontSize: 11, color: tokens.textMuted, lineHeight: 1.5 }}>
        未设置时始终显示。条件与默认可见和方法设置的显隐同时生效；设计画布仍保留场景点。
      </chakra.p>
      {value && (
        <>
          <chakra.label style={{ display: "block", fontSize: 11, marginBottom: 10 }}>
            规则组合
            <EditorSelect aria-label="规则组合" value={value.logic}
              onChange={(event) => onChange({ ...value, logic: event.target.value as HotspotConditionGroup["logic"] })}
              style={{ ...fieldStyle, marginTop: 4 }}>
              <EditorSelectOption value="all">全部满足</EditorSelectOption>
              <EditorSelectOption value="any">任一满足</EditorSelectOption>
            </EditorSelect>
          </chakra.label>
          {value.conditions.map((condition, index) => {
            const options = operatorOptions(condition.valueType);
            const noValue = condition.operator === "truthy" || condition.operator === "falsy";
            return (
              <chakra.div key={index} style={{
                padding: 10, marginBottom: 9, border: "1px solid " + tokens.border,
                borderRadius: 6, background: tokens.bgElevated,
              }}>
                <chakra.div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <chakra.span style={{ fontSize: 11, fontWeight: 600 }}>条件 {index + 1}</chakra.span>
                  <Button size="xs" variant="plain" type="button" aria-label={"删除条件 " + (index+1)} style={buttonStyle}
                    onClick={() => remove(index)}>删除</Button>
                </chakra.div>
                <chakra.label style={{ display: "block", fontSize: 11, marginBottom: 8 }}>
                  游戏变量名
                  <Input size="xs" aria-label={"条件 " + (index+1) + " 游戏变量名"}
                    value={condition.target} placeholder="例如：已解锁"
                    onChange={(event) => update(index, { ...condition, target: event.target.value })}
                    style={{ ...fieldStyle, marginTop: 4 }} />
                </chakra.label>
                <chakra.div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <chakra.label style={{ display: "block", fontSize: 11 }}>
                    类型
                    <EditorSelect aria-label={"条件 " + (index+1) + " 类型"} value={condition.valueType}
                      onChange={(event) => {
                        const type = event.target.value as HotspotCondition["valueType"];
                        update(index, { ...condition, valueType: type, operator: "eq",
                          value: type === "number" ? 0 : type === "bool" ? false : "", compareTo: undefined });
                      }} style={{ ...fieldStyle, marginTop: 4 }}>
                      <EditorSelectOption value="string">文本</EditorSelectOption>
                      <EditorSelectOption value="number">数字</EditorSelectOption>
                      <EditorSelectOption value="bool">布尔</EditorSelectOption>
                    </EditorSelect>
                  </chakra.label>
                  <chakra.label style={{ display: "block", fontSize: 11 }}>
                    判断
                    <EditorSelect aria-label={"条件 " + (index+1) + " 判断"} value={condition.operator}
                      onChange={(event) => update(index, { ...condition,
                        operator: event.target.value as HotspotCondition["operator"] })}
                      style={{ ...fieldStyle, marginTop: 4 }}>
                      {options.map(([operator, label]) => <EditorSelectOption key={operator} value={operator}>{label}</EditorSelectOption>)}
                    </EditorSelect>
                  </chakra.label>
                </chakra.div>
                {!noValue && (
                  <>
                    <chakra.label style={{ display: "block", fontSize: 11, marginTop: 8 }}>
                      比较对象
                      <EditorSelect aria-label={"条件 " + (index+1) + " 比较对象"}
                        value={condition.compareTo ? "variable" : "value"}
                        onChange={(event) => update(index, event.target.value === "variable"
                          ? { ...condition, compareTo: { source: "game", target: "" } }
                          : { ...condition, compareTo: undefined })}
                        style={{ ...fieldStyle, marginTop: 4 }}>
                        <EditorSelectOption value="value">固定值</EditorSelectOption>
                        <EditorSelectOption value="variable">游戏变量</EditorSelectOption>
                      </EditorSelect>
                    </chakra.label>
                    {condition.compareTo ? (
                      <Input size="xs" aria-label={"条件 " + (index+1) + " 比较变量名"}
                        value={condition.compareTo.target} placeholder="比较变量名"
                        onChange={(event) => update(index, { ...condition,
                          compareTo: { source: "game", target: event.target.value } })}
                        style={{ ...fieldStyle, marginTop: 7 }} />
                    ) : condition.valueType === "bool" ? (
                      <EditorSelect aria-label={"条件 " + (index+1) + " 比较值"}
                        value={String(condition.value ?? false)}
                        onChange={(event) => update(index, { ...condition, value: event.target.value === "true" })}
                        style={{ ...fieldStyle, marginTop: 7 }}>
                        <EditorSelectOption value="true">真</EditorSelectOption>
                        <EditorSelectOption value="false">假</EditorSelectOption>
                      </EditorSelect>
                    ) : (
                      <Input size="xs" aria-label={"条件 " + (index+1) + " 比较值"}
                        type={condition.valueType === "number" ? "number" : "text"}
                        value={condition.value === undefined ? "" : String(condition.value)}
                        onChange={(event) => update(index, { ...condition,
                          value: condition.valueType === "number" ? Number(event.target.value) : event.target.value })}
                        style={{ ...fieldStyle, marginTop: 7 }} />
                    )}
                  </>
                )}
              </chakra.div>
            );
          })}
          <Button size="xs" variant="plain" type="button" style={buttonStyle}
            onClick={() => onChange({ ...value, conditions: [...value.conditions, newCondition()] })}>
            <IconLabel icon="plus" iconSize={11}>添加一条规则</IconLabel>
          </Button>
        </>
      )}
    </chakra.section>
  );
}
