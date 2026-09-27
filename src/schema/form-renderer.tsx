import { EditorSelect, EditorSelectOption } from "../editor/ui/editor-select";
import { editorInputProps } from "../editor/ui/editor-control-styles";
/**
 * form-renderer.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.3
 *
 * Schema 驱动受控属性表单渲染器（精简版）。
 * 支持 string / number / boolean / enum / asset / color 叶子，以及 section / grid 布局。
 * color 字段走 Chakra ColorPicker 复合控件，保留作者 HEX 数据格式。
 * number：聚焦期间用草稿字符串，失焦后再按 min/max 钳制提交，避免输入「300」时「3」被钳回 min。
 */

import { Textarea, Input, Checkbox, chakra } from "@chakra-ui/react";
import React, { useEffect, useMemo, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import { resolveContextAssetUrl } from "../shared/resolve-context-asset-url";
import { ProjectImagePicker } from "../editor/ui/project-image-picker";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";
import { ColorPicker } from "./color-picker";
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
    <chakra.label
      htmlFor={htmlFor}
      style={{
        fontSize: FONT_SIZE_DEFAULT,
        fontWeight: 550,
        color: tokens.textPrimary,
        whiteSpace: label === "其他交互点完成后显示" ? "nowrap" : "pre-line",
      }}
    >
      {label}
    </chakra.label>
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
    <chakra.span style={{ fontSize: 11, color: tokens.textMuted, lineHeight: 1.35 }}>
      {text}
    </chakra.span>
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
    <chakra.div style={fieldWrapStyle()} data-testid={`schema-field-${field.key}`}>
      <FieldLabel label={field.label} tokens={tokens} htmlFor={id} />
      {field.multiline ? (
        <Textarea size="xs" {...common} rows={3} />
      ) : (
        <Input size="xs" type="text" {...common} />
      )}
      <FieldHint text={field.description} tokens={tokens} />
    </chakra.div>
  );
}

/**
 * 将草稿文本解析为有限数，并按字段 min/max 钳制。
 *
 * @param draft - 输入框草稿（可为空、中间态）
 * @param field - number 字段 schema（读取 min/max）
 * @param fallback - 草稿非法时的回退值
 * @returns 钳制后的有限数
 *
 * @example
 * ```ts
 * clampNumberFieldValue("3", { min: 120, max: 420 }, 280); // 聚焦中不调用；失焦时 → 120
 * clampNumberFieldValue("300", { min: 120, max: 420 }, 280); // → 300
 * ```
 *
 * @remarks
 * 本函数不抛异常；非法草稿回退 `fallback` 再钳制。
 */
export function clampNumberFieldValue(
  draft: string,
  field: Pick<NumberFieldSchema, "min" | "max">,
  fallback: number,
): number {
  const trimmed = draft.trim();
  let next =
    trimmed.length === 0 ? fallback : Number(trimmed);

  if (!Number.isFinite(next)) {
    next = fallback;
  }

  if (field.min !== undefined && Number.isFinite(field.min)) {
    next = Math.max(field.min, next);
  }

  if (field.max !== undefined && Number.isFinite(field.max)) {
    next = Math.min(field.max, next);
  }

  return next;
}

/**
 * number 字段内部控件：聚焦用草稿，失焦再提交钳制结果。
 *
 * @template T - 被编辑对象类型
 * @param props.field - NumberFieldSchema
 * @param props.value - 当前对象
 * @param props.onChange - 变更回调
 * @param props.tokens - 主题
 * @returns 控件节点
 */
function SchemaNumberField<T extends Record<string, unknown>>(props: {
  field: NumberFieldSchema;
  value: T;
  onChange: FormOnChange<T>;
  tokens: ThemeTokens;
}): React.ReactElement {
  const { field, value, onChange, tokens } = props;
  const raw = getNestedValue(value, field.key);
  const committed =
    typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  const id = `field-${field.key}`;

  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(committed));

  /**
   * 外部值变化且未聚焦时，同步草稿（避免画布/重置改值后输入框陈旧）。
   */
  useEffect(() => {
    if (!focused) {
      setDraft(String(committed));
    }
  }, [committed, focused]);

  /**
   * 失焦或 Enter：解析草稿、钳制并写回父级。
   */
  const commitDraft = (): void => {
    const next = clampNumberFieldValue(draft, field, committed);

    setFocused(false);
    setDraft(String(next));

    if (next !== committed) {
      onChange(setNestedValue(value, field.key, next));
    }
  };

  return (
    <chakra.div style={fieldWrapStyle()} data-testid={`schema-field-${field.key}`}>
      <FieldLabel label={field.label} tokens={tokens} htmlFor={id} />
      <Input size="xs"
        id={id}
        type="number"
        value={focused ? draft : String(committed)}
        step={field.step ?? 1}
        style={inputStyle(tokens)}
        onFocus={() => {
          setFocused(true);
          setDraft(String(committed));
        }}
        onChange={(e) => {
          /**
           * 聚焦期间只改草稿，不立刻 onChange：
           * 父级 normalize 会按 min 钳制，「3」会被打回 120。
           */
          setDraft(e.target.value);
        }}
        onBlur={() => {
          commitDraft();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
      />
      <FieldHint text={field.description} tokens={tokens} />
    </chakra.div>
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
  return (
    <SchemaNumberField
      field={field}
      value={value}
      onChange={onChange}
      tokens={tokens}
    />
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

  return (
    <chakra.div style={fieldWrapStyle()} data-testid={`schema-field-${field.key}`}>
      <Checkbox.Root
        checked={checked}
        onCheckedChange={(details) =>
          onChange(setNestedValue(value, field.key, details.checked === true))
        }
        colorPalette="teal"
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label
          style={{
            fontSize: FONT_SIZE_DEFAULT,
            fontWeight: 550,
            color: tokens.textPrimary,
            whiteSpace: field.label === "其他交互点完成后显示" ? "nowrap" : "pre-line",
          }}
        >
          {field.label}
        </Checkbox.Label>
      </Checkbox.Root>
      <FieldHint text={field.description} tokens={tokens} />
    </chakra.div>
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
    <chakra.div style={fieldWrapStyle()} data-testid={`schema-field-${field.key}`}>
      <FieldLabel label={field.label} tokens={tokens} htmlFor={id} />
      <EditorSelect
        id={id}
        value={str}
        style={inputStyle(tokens)}
        onChange={(e) => {
          onChange(setNestedValue(value, field.key, e.target.value));
        }}
      >
        {field.options.map((opt) => (
          <EditorSelectOption key={opt.value} value={opt.value}>
            {opt.label}
          </EditorSelectOption>
        ))}
      </EditorSelect>
      <FieldHint text={field.description} tokens={tokens} />
    </chakra.div>
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
/**
 * asset 字段内联缩略图：经 asset.resolve 后再给 img.src。
 *
 * @param props.uri - 领域路径
 * @param props.tokens - 主题
 * @returns 缩略图或 null
 */
function AssetFieldThumb({
  uri,
  tokens,
}: {
  uri: string;
  tokens: ThemeTokens;
}): React.ReactElement | null {
  const ctx = useExtensionContext();
  const url = useMemo(
    () => resolveContextAssetUrl(ctx, uri),
    [uri, ctx],
  );

  if (!url) {
    return null;
  }

  return (
    <chakra.img
      src={url}
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
  );
}

/**
 * 渲染 asset 字段（文本路径 + 可选缩略图预览）。
 *
 * @param field - AssetFieldSchema
 * @param value - 表单对象
 * @param onChange - 变更回调
 * @param tokens - 主题
 * @returns 字段 React 元素
 */
function renderAssetField<T extends Record<string, unknown>>(
  field: AssetFieldSchema,
  value: T,
  onChange: FormOnChange<T>,
  tokens: ThemeTokens,
): React.ReactElement {
  return <SchemaAssetField field={field} value={value} onChange={onChange} tokens={tokens} />;
}

function SchemaAssetField<T extends Record<string, unknown>>({
  field, value, onChange, tokens,
}: {
  field: AssetFieldSchema;
  value: T;
  onChange: FormOnChange<T>;
  tokens: ThemeTokens;
}): React.ReactElement {
  const raw = getNestedValue(value, field.key);
  const str = typeof raw === "string" ? raw : "";
  const id = `field-${field.key}`;
  const showPreview =
    field.showPreview !== false && (field.accept ?? "image") === "image";

  return (
    <chakra.div style={fieldWrapStyle()} data-testid={`schema-field-${field.key}`}>
      <FieldLabel label={field.label} tokens={tokens} htmlFor={id} />
      <Input {...editorInputProps(tokens)} size="xs" h="28px" w="100%"
        id={id}
        type="text"
        value={str}
        placeholder={field.placeholder ?? "asset://… 或 https://…"}
        onChange={(e) => {
          onChange(setNestedValue(value, field.key, e.target.value));
        }}
      />
      {(field.accept ?? "image") === "image" ? (
        <ProjectImagePicker value={str} label={field.label}
          onChange={(path) => onChange(setNestedValue(value, field.key, path))} />
      ) : null}
      {showPreview && str.trim() !== "" ? (
        <AssetFieldThumb uri={str} tokens={tokens} />
      ) : null}
      <FieldHint text={field.description} tokens={tokens} />
    </chakra.div>
  );
}

/**
 * 渲染 color 字段（Chakra ColorPicker：色板 / 色相 / Alpha / 精确通道）。
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
  const stored = typeof raw === "string" ? raw : "";

  return (
    <chakra.div style={fieldWrapStyle()} data-testid={`schema-field-${field.key}`}>
      <FieldLabel label={field.label} tokens={tokens} htmlFor={`field-${field.key}`} />
      <ColorPicker
        value={stored}
        allowAlpha={field.allowAlpha === true}
        placeholder={field.placeholder}
        tokens={tokens}
        ariaLabel={field.label}
        onChange={(css) => {
          onChange(setNestedValue(value, field.key, css));
        }}
      />
      <FieldHint text={field.description} tokens={tokens} />
    </chakra.div>
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
    <chakra.section
      data-testid={`schema-section-${field.id}`}
      style={{
        marginBottom: 14,
        paddingBottom: 8,
        borderBottom: `1px solid ${tokens.border}`,
      }}
    >
      <chakra.h3
        style={{
          margin: "0 0 8px",
          fontSize: FONT_SIZE_TITLE,
          fontWeight: 650,
          color: tokens.textPrimary,
        }}
      >
        {field.title}
      </chakra.h3>
      {field.description ? (
        <chakra.p
          style={{
            margin: "0 0 8px",
            fontSize: 11,
            color: tokens.textMuted,
            lineHeight: 1.35,
          }}
        >
          {field.description}
        </chakra.p>
      ) : null}
      {renderFields(field.children, value, onChange)}
    </chakra.section>
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
    <chakra.div
      data-testid={`schema-grid-${field.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap,
        marginBottom: 10,
      }}
    >
      {renderFields(field.children, value, onChange)}
    </chakra.div>
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
    <chakra.div data-testid="form-renderer" style={{ display: "block" }}>
      {renderFields(schema, value, onChange)}
    </chakra.div>
  );
}
