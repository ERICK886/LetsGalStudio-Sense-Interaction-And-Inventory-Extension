import { Portal, Select, createListCollection } from "@chakra-ui/react";
import * as React from "react";
import { useMemo } from "react";
import { useTheme } from "../../theme/theme-provider";
import { useEditorPopoverPosition } from "./editor-popover-position";

interface Option {
  value: string;
  label: string;
  disabled: boolean;
}

const EMPTY_VALUE = "__AVG_EXTENSION_SELECT_EMPTY__";

function optionLabel(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(optionLabel).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return optionLabel(node.props.children);
  }
  return "";
}

function collectOptions(children: React.ReactNode): Option[] {
  const result: Option[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>(child)) return;
    if (child.type === React.Fragment) {
      result.push(...collectOptions(child.props.children));
    } else if (child.props.value !== undefined) {
      result.push({
        value: String(child.props.value),
        label: optionLabel(child.props.children),
        disabled: child.props.disabled === true,
      });
    }
  });
  return result;
}

export interface EditorSelectOptionProps {
  value: string | number;
  disabled?: boolean;
  children: React.ReactNode;
}

/** Select.Item 的声明项，仅供 EditorSelect 构建 Chakra collection。 */
export function EditorSelectOption(_props: EditorSelectOptionProps): null {
  return null;
}

export interface EditorSelectProps extends Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "defaultValue" | "onChange"
> {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  "data-testid"?: string;
}

/** 与 StudioSelect 同构的 Chakra Select，兼容现有表单的 option/onChange 契约。 */
export function EditorSelect({
  value, onChange, children, style, disabled, id, name,
  "aria-label": ariaLabel, "data-testid": testId, title,
}: EditorSelectProps): React.ReactElement {
  const { tokens } = useTheme();
  const options = useMemo(() => collectOptions(children), [children]);
  const items = useMemo(
    () => options.map((option) => ({
      ...option,
      selectValue: option.value === "" ? EMPTY_VALUE : option.value,
    })),
    [options],
  );
  const collection = useMemo(
    () => createListCollection({
      items,
      itemToValue: (item) => item.selectValue,
      itemToString: (item) => item.label,
      isItemDisabled: (item) => item.disabled,
    }),
    [items],
  );
  const selectedValue = value === "" && options.some((option) => option.value === "")
    ? EMPTY_VALUE : value;
  const selected = collection.has(selectedValue) ? [selectedValue] : [];
  const { onOpenChange, triggerRef, positionerRef, portalRef, positionerStyle } =
    useEditorPopoverPosition();

  return (
    <Select.Root
      collection={collection}
      value={selected}
      disabled={disabled}
      lazyMount
      unmountOnExit
      positioning={{ strategy: "absolute", placement: "bottom-start", sameWidth: true, applyStyles: false, listeners: false }}
      w={style?.width ?? "100%"}
      flex={style?.flex}
      minW={style?.minWidth}
      onOpenChange={(details) => onOpenChange(details.open)}
      onValueChange={(details) => {
        const next = details.value[0];
        if (next === undefined) return;
        const nextValue = collection.find(next)?.value ?? next;
        onChange({
          target: { value: nextValue },
          currentTarget: { value: nextValue },
        } as React.ChangeEvent<HTMLSelectElement>);
      }}
    >
      <Select.HiddenSelect name={name} aria-label={ariaLabel} />
      <Select.Control>
        <Select.Trigger
          ref={triggerRef}
          id={id}
          aria-label={ariaLabel}
          data-testid={testId}
          title={title}
          onKeyDown={(event) => event.stopPropagation()}
          style={style}
          h="28px"
          w="100%"
          minW={0}
          px="8px"
          bg={tokens.bgSunken}
          border={"1px solid " + tokens.border}
          borderRadius="6px"
          fontSize="12px"
          color={tokens.textPrimary}
          _hover={{ borderColor: tokens.borderStrong }}
          _focusVisible={{ borderColor: tokens.accent, boxShadow: "0 0 0 1px " + tokens.accent }}
        >
          <Select.ValueText placeholder={ariaLabel ?? "请选择"} />
          <Select.Indicator color={tokens.textMuted} />
        </Select.Trigger>
      </Select.Control>
      <Portal container={portalRef}>
        <Select.Positioner ref={positionerRef} style={positionerStyle}>
          <Select.Content
            zIndex={10000}
            onKeyDown={(event) => event.stopPropagation()}
            maxH="320px"
            overflowY="auto"
            p="2px"
            bg={tokens.bgElevated}
            color={tokens.textPrimary}
            border={"1px solid " + tokens.borderStrong}
            borderRadius="6px"
            boxShadow="0 12px 32px rgba(0, 0, 0, 0.25)"
          >
            {items.map((item) => (
              <Select.Item
                key={item.selectValue}
                item={item}
                px="8px"
                py="6px"
                fontSize="12px"
                minW={0}
                cursor={item.disabled ? "not-allowed" : "default"}
                _highlighted={{ bg: tokens.bgSunken }}
              >
                <Select.ItemText truncate>{item.label}</Select.ItemText>
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
