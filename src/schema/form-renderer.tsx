/**
 * form-renderer.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * Schema 驱动受控属性表单渲染器（精简版）。
 * 支持 string / number / boolean / enum / asset / color 叶子，以及 section / grid 布局。
 */

import React from "react";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";
import {
  getNestedValue,
  isLayoutField,
  setNestedValue,
  type AssetFieldSchema,
  type BooleanFieldSchema,
  type ColorFieldSchema,
  type EnumFieldSchema,
  type FieldSchema,
  type GridFieldSchema,
  type NumberFieldSchema,
  type SectionFieldSchema,
  type StringFieldSchema,
} from "./types";

/**
 * 受控表单 onChange 回调类型。
 *
 * @template T - 被编辑对象类型
 */
export type FormOnChange<T> = (next: T) => void;

/**
 * FormRenderer 组件属性。
 *
 * @template T - 被编辑对象类型
 */
export interface FormRendererProps<T extends Record<string, unknown>> {
  /** 当前字段 schema 列表 */
  schema: FieldSchema[];

  /** 当前对象值（受控） */
  value: T;

  /** 值变更回调 */
  onChange: FormOnChange<T>;
}

/**
 * 通用输入框样式。
 *
 * @param tokens - 主题 token
 * @returns CSSProperties
 */
function inputStyle(tokens: ThemeTokens): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 9px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: tokens.bgSunken,
    color: tokens.textPrimary,
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    outline: "none",
  };
}

/**
 * 字段外层容器样式。
 *
 * @returns CSSProperties
 */
function fieldWrapStyle(): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 10,
  };
}

/**
 * 字段标签行。
 *
 * @param props.label - 标签文案
 * @param props.tokens - 主题
 * @param props.htmlFor - 关联控件 id
 * @returns 标签元素
 */
function FieldLabel({
  label,
  tokens,
  htmlFor,
}: {
  label: string;
  tokens: ThemeTokens;
  htmlFor?: string;
}): React.ReactElement {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        fontSize: FONT_SIZE_DEFAULT,
        fontWeight: 550,
        color: tokens.textPrimary,
      }}
    >
      {label}
    </label>
  );
}

/**
 * 字段说明文案。
 *
 * @param props.text - 说明
 * @param props.tokens - 主题
 * @returns 说明段落；无文案时 null
 */
function FieldHint({
  text,
  tokens,
}: {
  text?: string;
  tokens: ThemeTokens;
}): React.ReactElement | null {
  if (!text) {
    return null;
  }

  return (
    <span style={{ fontSize: 11, color: tokens.textMuted, lineHeight: 1.35 }}>
      {text}
    </span>
  );
}

/**
 * 渲染 string 字段。
 *
 * @param field - StringFieldSchema
 * @param value - 当前对象
 * @param onChange - 变更回调
 * @param tokens - 主题
 * @returns 控件节点
 */
function renderStringField<T extends Record<string, unknown>>(
  field: StringFieldSchema,
  value: T,
  onChange: FormOnChange<T>,
  tokens: ThemeTokens,
): React.ReactElement {
  const raw = getNestedValue(value, field.key);
  const str = typeof raw === "string" ? raw : "";
  const id = `field-${field.key}`;

  const common = {
    id,
    value: str,
    placeholder: field.placeholder,
    style: inputStyle(tokens),
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      onChange(setNestedValue(value, field.key, e.target.value));
    },
  };

  return (
    <div style={fieldWrapStyle()} data-testid={`schema-field-${field.key}`}>
      <FieldLabel label={field.label} tokens={tokens} htmlFor={id} />
      {field.multiline ? (
        <textarea {...common} rows={3} />
      ) : (
        <input type="text" {...common} />
      )}
      <FieldHint text={field.description} tokens={tokens} />
    </div>
  );
}

/**
 * 渲染 number 字段。
 *
 * @param field - NumberFieldSchema
 * @param value - 当前对象
 * @param onChange - 变更回调
 * @param tokens - 主题
 * @returns 控件节点
 */
function renderNumberField<T extends Record<string, unknown>>(
  field: NumberFieldSchema,
  value: T,
  onChange: FormOnChange<T>,
  tokens: ThemeTokens,
): React.ReactElement {
  const raw = getNestedValue(value, field.key);
  const num = typeof raw === "number" && Number.isFinite(raw) ? raw : "";
  const id = `field-${field.key}`;

  return (
    <div style={fieldWrapStyle()} data-testid={`schema-field-${field.key}`}>
      <FieldLabel label={field.label} tokens={tokens} htmlFor={id} />
      <input
        id={id}
        type="number"
        value={num}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        style={inputStyle(tokens)}
        onChange={(e) => {
          const next = e.target.valueAsNumber;

          onChange(
            setNestedValue(
              value,
              field.key,
              Number.isFinite(next) ? next : 0,
            ),
          );
        }}
      />
      <FieldHint text={field.description} tokens={tokens} />
    </div>
  );
}

/**
 * 渲染 boolean 字段。
 *
 * @param field - BooleanFieldSchema
 * @param value - 当前对象
 * @param onChange - 变更回调
 * @param tokens - 主题
 * @returns 控件节点
 */
function renderBooleanField<T extends Record<string, unknown>>(
  field: BooleanFieldSchema,
  value: T,
  onChange: FormOnChange<T>,
  tokens: ThemeTokens,
): React.ReactElement {
  const raw = getNestedValue(value, field.key);
  const checked = Boolean(raw);
  const id = `field-${field.key}`;

  return (
    <div
      style={{
        ...fieldWrapStyle(),
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
      data-testid={`schema-field-${field.key}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(setNestedValue(value, field.key, e.target.checked));
        }}
      />
      <FieldLabel label={field.label} tokens={tokens} htmlFor={id} />
      <FieldHint text={field.description} tokens={tokens} />
    </div>
  );
}

/**
 * 渲染 enum 下拉字段。
 *
 * @param field - EnumFieldSchema
 * @param value - 当前对象
 * @param onChange - 变更回调
 * @param tokens - 主题
 * @returns 控件节点
 */
function renderEnumField<T extends Record<string, unknown>>(
  field: EnumFieldSchema,
  value: T,
  onChange: FormOnChange<T>,
  tokens: ThemeTokens,
): React.ReactElement {
  const raw = getNestedValue(value, field.key);
  const str = typeof raw === "string" ? raw : (field.options[0]?.value ?? "");
  const id = `field-${field.key}`;

  return (
    <div style={fieldWrapStyle()} data-testid={`schema-field-${field.key}`}>
      <FieldLabel label={field.label} tokens={tokens} htmlFor={id} />
      <select
        id={id}
        value={str}
        style={inputStyle(tokens)}
        onChange={(e) => {
          onChange(setNestedValue(value, field.key, e.target.value));
        }}
      >
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <FieldHint text={field.description} tokens={tokens} />
    </div>
  );
}

/**
 * 渲染 asset URI 字段（文本 + 可选图片预览）。
 *
 * @param field - AssetFieldSchema
 * @param value - 当前对象
 * @param onChange - 变更回调
 * @param tokens - 主题
 * @returns 控件节点
 */
function renderAssetField<T extends Record<string, unknown>>(
  field: AssetFieldSchema,
  value: T,
  onChange: FormOnChange<T>,
  tokens: ThemeTokens,
): React.ReactElement {
  const raw = getNestedValue(value, field.key);
  const str = typeof raw === "string" ? raw : "";
  const id = `field-${field.key}`;
  const showPreview =
    field.showPreview !== false && (field.accept ?? "image") === "image";

  return (
    <div style={fieldWrapStyle()} data-testid={`schema-field-${field.key}`}>
      <FieldLabel label={field.label} tokens={tokens} htmlFor={id} />
      <input
        id={id}
        type="text"
        value={str}
        placeholder={field.placeholder ?? "asset://… 或 https://…"}
        style={inputStyle(tokens)}
        onChange={(e) => {
          onChange(setNestedValue(value, field.key, e.target.value));
        }}
      />
      {showPreview && str.trim() !== "" ? (
        <img
          src={str}
          alt=""
          style={{
            maxWidth: "100%",
            maxHeight: 72,
            objectFit: "contain",
            borderRadius: 4,
            border: `1px solid ${tokens.border}`,
            background: tokens.bgSunken,
            marginTop: 4,
          }}
        />
      ) : null}
      <FieldHint text={field.description} tokens={tokens} />
    </div>
  );
}

/**
 * 渲染 color 字段（color + 文本旁路）。
 *
 * @param field - ColorFieldSchema
 * @param value - 当前对象
 * @param onChange - 变更回调
 * @param tokens - 主题
 * @returns 控件节点
 */
function renderColorField<T extends Record<string, unknown>>(
  field: ColorFieldSchema,
  value: T,
  onChange: FormOnChange<T>,
  tokens: ThemeTokens,
): React.ReactElement {
  const raw = getNestedValue(value, field.key);
  const str = typeof raw === "string" && raw.trim() !== "" ? raw : "#000000";
  const id = `field-${field.key}`;
  const hex6 = /^#[0-9a-fA-F]{6}/.test(str) ? str.slice(0, 7) : "#000000";

  return (
    <div style={fieldWrapStyle()} data-testid={`schema-field-${field.key}`}>
      <FieldLabel label={field.label} tokens={tokens} htmlFor={id} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="color"
          value={hex6}
          aria-label={field.label}
          onChange={(e) => {
            onChange(setNestedValue(value, field.key, e.target.value));
          }}
          style={{ width: 36, height: 32, padding: 0, border: "none" }}
        />
        <input
          id={id}
          type="text"
          value={typeof raw === "string" ? raw : ""}
          placeholder={field.placeholder ?? "#000000"}
          style={{ ...inputStyle(tokens), flex: 1 }}
          onChange={(e) => {
            onChange(setNestedValue(value, field.key, e.target.value));
          }}
        />
      </div>
      <FieldHint text={field.description} tokens={tokens} />
    </div>
  );
}

/**
 * 渲染 section 布局。
 *
 * @param field - SectionFieldSchema
 * @param value - 当前对象
 * @param onChange - 变更回调
 * @param tokens - 主题
 * @returns 分区节点
 */
function renderSectionField<T extends Record<string, unknown>>(
  field: SectionFieldSchema,
  value: T,
  onChange: FormOnChange<T>,
  tokens: ThemeTokens,
): React.ReactElement {
  return (
    <section
      data-testid={`schema-section-${field.id}`}
      style={{
        marginBottom: 14,
        paddingBottom: 8,
        borderBottom: `1px solid ${tokens.border}`,
      }}
    >
      <h3
        style={{
          margin: "0 0 8px",
          fontSize: FONT_SIZE_TITLE,
          fontWeight: 650,
          color: tokens.textPrimary,
        }}
      >
        {field.title}
      </h3>
      {field.description ? (
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 11,
            color: tokens.textMuted,
            lineHeight: 1.35,
          }}
        >
          {field.description}
        </p>
      ) : null}
      {renderFields(field.children, value, onChange)}
    </section>
  );
}

/**
 * 渲染 grid 布局。
 *
 * @param field - GridFieldSchema
 * @param value - 当前对象
 * @param onChange - 变更回调
 * @returns 网格节点
 */
function renderGridField<T extends Record<string, unknown>>(
  field: GridFieldSchema,
  value: T,
  onChange: FormOnChange<T>,
): React.ReactElement {
  const columns = field.columns ?? 2;
  const gap = field.gap ?? 8;

  return (
    <div
      data-testid={`schema-grid-${field.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap,
        marginBottom: 10,
      }}
    >
      {renderFields(field.children, value, onChange)}
    </div>
  );
}

/**
 * 递归渲染单个 schema 节点；未知 kind 时 warn 并跳过。
 *
 * @template T - 被编辑对象类型
 * @param field - 字段 / 布局 schema
 * @param value - 当前对象值
 * @param onChange - 变更回调
 * @param tokens - 主题 token
 * @returns 对应控件或 null
 */
export function renderSchemaNode<T extends Record<string, unknown>>(
  field: FieldSchema,
  value: T,
  onChange: FormOnChange<T>,
  tokens: ThemeTokens,
): React.ReactNode {
  switch (field.kind) {
    case "string":
      return renderStringField(field, value, onChange, tokens);
    case "number":
      return renderNumberField(field, value, onChange, tokens);
    case "boolean":
      return renderBooleanField(field, value, onChange, tokens);
    case "enum":
      return renderEnumField(field, value, onChange, tokens);
    case "asset":
      return renderAssetField(field, value, onChange, tokens);
    case "color":
      return renderColorField(field, value, onChange, tokens);
    case "section":
      return renderSectionField(field, value, onChange, tokens);
    case "grid":
      return renderGridField(field, value, onChange);
    default: {
      const unknown = field as { kind: string };
      console.warn(
        `[FormRenderer] 未知字段 kind: ${String(unknown.kind)}，已跳过`,
        field,
      );

      return null;
    }
  }
}

/**
 * 渲染 schema 驱动的受控表单字段列表。
 *
 * @template T - 被编辑对象类型
 * @param schema - 字段 schema 数组
 * @param value - 当前对象值
 * @param onChange - 变更回调
 * @returns React 字段节点数组
 *
 * @example
 * ```tsx
 * {renderFields(sceneFields(scene), scene, setScene)}
 * ```
 */
export function renderFields<T extends Record<string, unknown>>(
  schema: FieldSchema[],
  value: T,
  onChange: FormOnChange<T>,
): React.ReactNode[] {
  // tokens 由 FormRenderer 注入不方便递归；此处读 hook 仅在组件树内调用
  // 改为内部组件包装，避免 hooks 规则问题——见 FieldsList
  return schema.map((field) => (
    <SchemaNode
      key={isLayoutField(field) ? field.id : field.key}
      field={field}
      value={value}
      onChange={onChange}
    />
  ));
}

/**
 * 单节点包装：在组件内调用 useTheme。
 *
 * @param props.field - schema
 * @param props.value - 值
 * @param props.onChange - 变更
 * @returns 渲染结果
 */
function SchemaNode<T extends Record<string, unknown>>({
  field,
  value,
  onChange,
}: {
  field: FieldSchema;
  value: T;
  onChange: FormOnChange<T>;
}): React.ReactElement {
  const { tokens } = useTheme();

  return <>{renderSchemaNode(field, value, onChange, tokens)}</>;
}

/**
 * Schema 驱动受控表单容器组件。
 *
 * @param props.schema - 字段定义
 * @param props.value - 当前值
 * @param props.onChange - 变更回调
 * @returns 垂直排列的表单字段
 *
 * @example
 * ```tsx
 * <FormRenderer
 *   schema={sceneFields(scene)}
 *   value={scene as SceneDefinition & Record<string, unknown>}
 *   onChange={(next) => onSceneChange(next as SceneDefinition)}
 * />
 * ```
 */
export function FormRenderer<T extends Record<string, unknown>>({
  schema,
  value,
  onChange,
}: FormRendererProps<T>): React.ReactElement {
  return (
    <div data-testid="form-renderer" style={{ display: "block" }}>
      {renderFields(schema, value, onChange)}
    </div>
  );
}
