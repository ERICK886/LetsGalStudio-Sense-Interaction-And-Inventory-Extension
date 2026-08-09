/**
 * types.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * Schema 驱动属性表单的精简字段类型定义。
 * 支持叶子字段（string / number / boolean / enum / asset / color）与布局节点（section / grid）。
 * ColorFieldSchema 支持 allowAlpha 控制是否允许编辑透明度（Task 1）。
 */

/**
 * 叶子字段基础元数据；布局节点（section / grid）不使用此接口。
 */
export interface FieldSchemaBase {
  /**
   * 对象上的路径，支持点分嵌套。
   * 例如 `"name"`、`"visual.src"`、`"hoverShadow.enabled"`。
   */
  key: string;

  /** 表单标签文案 */
  label: string;

  /** 可选说明，渲染为字段下方提示 */
  description?: string;
}

/**
 * 单行或多行文本字段。
 */
export interface StringFieldSchema extends FieldSchemaBase {
  kind: "string";

  /** 输入框占位符 */
  placeholder?: string;

  /** true 时渲染 textarea */
  multiline?: boolean;
}

/**
 * 数值字段，可配置 min / max / step。
 */
export interface NumberFieldSchema extends FieldSchemaBase {
  kind: "number";

  /** 最小值（含） */
  min?: number;

  /** 最大值（含） */
  max?: number;

  /** 步进值 */
  step?: number;
}

/**
 * 布尔开关字段。
 */
export interface BooleanFieldSchema extends FieldSchemaBase {
  kind: "boolean";
}

/**
 * 枚举下拉字段。
 */
export interface EnumFieldSchema extends FieldSchemaBase {
  kind: "enum";

  /** 可选项列表 */
  options: ReadonlyArray<{ value: string; label: string }>;
}

/**
 * 素材 URI 字段（底图、精灵图等）；精简实现为文本输入 + 可选预览。
 */
export interface AssetFieldSchema extends FieldSchemaBase {
  kind: "asset";

  /** 接受的素材类型，默认 image */
  accept?: "image" | "audio" | "video" | "any";

  /** 输入框占位符 */
  placeholder?: string;

  /** 是否显示缩略图预览；image 类型默认 true */
  showPreview?: boolean;
}

/**
 * 颜色字段；值为 `#RRGGBB` 或（allowAlpha 为 true 时）`#RRGGBBAA` 十六进制字符串。
 */
export interface ColorFieldSchema extends FieldSchemaBase {
  kind: "color";

  /** 文本输入框占位符 */
  placeholder?: string;

  /**
   * 是否允许编辑透明度；默认 false。
   * true 时 FormRenderer / ColorPicker 可输出带 Alpha 通道的八位 HEX。
   */
  allowAlpha?: boolean;
}

/**
 * 分段标题布局节点；children 为子字段或嵌套布局。
 */
export interface SectionFieldSchema {
  kind: "section";

  /** 稳定 id，仅用于 React key / testid，不写入领域对象 */
  id: string;

  /** 分段标题文案 */
  title: string;

  /** 可选分段说明 */
  description?: string;

  /** 子字段或嵌套布局 */
  children: FieldSchema[];
}

/**
 * 多列网格布局节点；子项按行优先填充。
 */
export interface GridFieldSchema {
  kind: "grid";

  /** 稳定 id，仅用于 React key / testid */
  id: string;

  /** 列数，默认 2 */
  columns?: 2 | 3;

  /** 列间距（px），默认 8 */
  gap?: number;

  /** 网格内子字段或嵌套布局 */
  children: FieldSchema[];
}

/**
 * 属性面板单字段 schema 联合类型（叶子 + 布局）。
 */
export type FieldSchema =
  | StringFieldSchema
  | NumberFieldSchema
  | BooleanFieldSchema
  | EnumFieldSchema
  | AssetFieldSchema
  | ColorFieldSchema
  | SectionFieldSchema
  | GridFieldSchema;

/**
 * 叶子字段联合类型；排除 section / grid 布局节点。
 */
export type LeafFieldSchema = Exclude<
  FieldSchema,
  SectionFieldSchema | GridFieldSchema
>;

/**
 * 判断是否为布局节点（section / grid）。
 *
 * @param field - 任意 FieldSchema
 * @returns 是否为布局节点
 */
export function isLayoutField(
  field: FieldSchema,
): field is SectionFieldSchema | GridFieldSchema {
  return field.kind === "section" || field.kind === "grid";
}

/**
 * 根据 key 路径从对象读取嵌套值。
 *
 * @param obj - 源对象
 * @param path - 点分路径，如 `"visual.src"`
 * @returns 路径上的值；路径不存在时 undefined
 *
 * @example
 * ```ts
 * getNestedValue({ visual: { src: "a.png" } }, "visual.src"); // "a.png"
 * ```
 */
export function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const segments = path.split(".");
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);

      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }

      current = current[index];
      continue;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * 根据 key 路径写入嵌套值，返回浅拷贝后的新对象（不 mutate 原对象）。
 *
 * @param obj - 源对象
 * @param path - 点分路径
 * @param value - 要写入的值
 * @returns 更新后的新对象
 *
 * @example
 * ```ts
 * setNestedValue({ name: "A" }, "x", 0.5); // { name: "A", x: 0.5 }
 * ```
 *
 * @throws 无运行时抛错；非法中间路径会以空对象补齐
 */
export function setNestedValue<T extends Record<string, unknown>>(
  obj: T,
  path: string,
  value: unknown,
): T {
  const segments = path.split(".");
  const isIndex = (segment: string): boolean => /^\d+$/.test(segment);

  const setAt = (current: unknown, depth: number): unknown => {
    const key = segments[depth]!;

    if (depth === segments.length - 1) {
      if (Array.isArray(current)) {
        const next = current.slice();
        next[Number(key)] = value;

        return next;
      }

      const next = {
        ...((current !== null && typeof current === "object"
          ? current
          : {}) as Record<string, unknown>),
      };
      next[key] = value;

      return next;
    }

    const childKey = segments[depth + 1]!;

    if (Array.isArray(current)) {
      const index = Number(key);
      const child = current[index];
      const nextChild = setAt(
        child !== undefined && child !== null
          ? child
          : isIndex(childKey)
            ? []
            : {},
        depth + 1,
      );
      const next = current.slice();
      next[index] = nextChild;

      return next;
    }

    const objCur = (
      current !== null && typeof current === "object"
        ? current
        : {}
    ) as Record<string, unknown>;
    const child = objCur[key];
    const nextChild = setAt(
      child !== undefined && child !== null
        ? child
        : isIndex(childKey)
          ? []
          : {},
      depth + 1,
    );

    return { ...objCur, [key]: nextChild };
  };

  return setAt({ ...obj }, 0) as T;
}
