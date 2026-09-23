import {
  Box, ColorPicker as ChakraColorPicker, Flex, Input, NativeSelect,
  Portal, Text, parseColor,
} from "@chakra-ui/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";

export interface ColorPickerProps {
  value: string;
  onChange: (css: string) => void;
  allowAlpha?: boolean;
  label?: string;
  disabled?: boolean;
  placeholder?: string;
  tokens?: ThemeTokens;
  ariaLabel?: string;
}

interface Rgba { r: number; g: number; b: number; a: number }
type PickerColor = ReturnType<typeof parseColor>;
type EditMode = "rgba" | "hsla" | "hsba";

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** 保留旧作者数据中的 HEX / RGB(A) 读取契约。 */
export function tryParseCssColor(css: string): Rgba | null {
  const text = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) digits = digits.split("").map((digit) => digit + digit).join("");
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(text);
  if (!rgb) return null;
  return {
    r: clamp(Number(rgb[1]), 0, 255),
    g: clamp(Number(rgb[2]), 0, 255),
    b: clamp(Number(rgb[3]), 0, 255),
    a: rgb[4] === undefined ? 1 : clamp(Number(rgb[4]), 0, 1),
  };
}

export function parseCssColor(css: string): Rgba {
  return tryParseCssColor(css) ?? { r: 255, g: 255, b: 255, a: 1 };
}

export function rgbaToHex(rgba: Rgba, withAlpha: boolean): string {
  const byte = (value: number) => clamp(Math.round(value), 0, 255)
    .toString(16).padStart(2, "0").toUpperCase();
  return "#" + byte(rgba.r) + byte(rgba.g) + byte(rgba.b) +
    (withAlpha ? byte(rgba.a * 255) : "");
}

function toChakraColor(css: string, allowAlpha: boolean): PickerColor {
  const rgba = parseCssColor(css);
  return parseColor(
    "rgba(" + rgba.r + ", " + rgba.g + ", " + rgba.b + ", " +
    (allowAlpha ? rgba.a : 1) + ")",
  );
}

function serializeColor(color: PickerColor, allowAlpha: boolean): string {
  const rgba = color.toFormat("rgba").toJSON() as unknown as Rgba;
  return rgbaToHex({
    r: rgba.r,
    g: rgba.g,
    b: rgba.b,
    a: allowAlpha ? color.getChannelValue("alpha") : 1,
  }, allowAlpha);
}

/** 缩放的 Studio 预览中，弹层须挂在编辑器根节点内。 */
function useEditorPortal() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>("[data-extension-editor-root]"));
  }, []);
  return useMemo(() => ({ current: container }), [container]);
}

/** 使用与 light-engine 公共颜色字段相同的 Chakra ColorPicker 交互结构。 */
export function ColorPicker({
  value, onChange, allowAlpha = false, label, disabled = false,
  placeholder, tokens, ariaLabel,
}: ColorPickerProps): React.ReactElement {
  const { tokens: contextTokens } = useTheme();
  const theme = tokens ?? contextTokens;
  const [color, setColor] = useState(() => toChakraColor(value, allowAlpha));
  const colorRef = useRef(color);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<EditMode>("rgba");
  const [hexDraft, setHexDraft] = useState(value);
  const [hexFocused, setHexFocused] = useState(false);
  const pointerEditing = useRef(false);
  const cancelHexBlur = useRef(false);
  const portalRef = useEditorPortal();

  useEffect(() => {
    if (open && pointerEditing.current) return;
    const next = toChakraColor(value, allowAlpha);
    setColor(next);
    colorRef.current = next;
    if (!hexFocused) setHexDraft(value);
  }, [value, allowAlpha, open, hexFocused]);

  const commit = (next: PickerColor) => {
    const serialized = serializeColor(next, allowAlpha);
    if (serialized !== value.toUpperCase()) onChange(serialized);
  };
  const updateColor = (next: PickerColor) => {
    setColor(next);
    colorRef.current = next;
    setHexDraft(serializeColor(next, allowAlpha));
    if (!pointerEditing.current) commit(next);
  };
  const commitHex = () => {
    const parsed = tryParseCssColor(hexDraft);
    if (!parsed) {
      setHexDraft(value);
      return;
    }
    const next = toChakraColor(hexDraft, allowAlpha);
    setColor(next);
    colorRef.current = next;
    commit(next);
  };
  const finishPointer = () => {
    if (!pointerEditing.current) return;
    pointerEditing.current = false;
    commit(colorRef.current);
  };
  const swatchEmpty = value.trim() === "";

  return (
    <Box w="100%">
      {label && <Text fontSize="11px" color={theme.textMuted} mb="4px">{label}</Text>}
      <ChakraColorPicker.Root
        value={color}
        format={mode}
        size="xs"
        disabled={disabled}
        positioning={{ strategy: "absolute", placement: "bottom-start", flip: true, slide: true }}
        onOpenChange={(details) => setOpen(details.open)}
        onValueChange={(details) => updateColor(details.value)}
        onValueChangeEnd={() => finishPointer()}
      >
        <ChakraColorPicker.Control w="100%" gap="6px">
          <ChakraColorPicker.Trigger
            aria-label={ariaLabel ?? "打开颜色面板"}
            title={ariaLabel ?? "打开颜色面板"}
            type="button"
            flexShrink={0}
            w="30px"
            h="30px"
            p="3px"
            overflow="hidden"
            bg={theme.bgSunken}
            border={"1px solid " + theme.border}
            borderRadius="6px"
            _focusVisible={{ borderColor: theme.accent, boxShadow: "0 0 0 1px " + theme.accent }}
          >
            {swatchEmpty ? (
              <Box w="100%" h="100%" border={"1px dashed " + theme.borderStrong} borderRadius="3px" />
            ) : (
              <Box position="relative" w="100%" h="100%" borderRadius="3px" overflow="hidden">
                {allowAlpha && <ChakraColorPicker.TransparencyGrid position="absolute" inset={0} size="6px" />}
                <ChakraColorPicker.ValueSwatch respectAlpha={allowAlpha}
                  position="absolute" inset={0} w="100%" h="100%" />
              </Box>
            )}
          </ChakraColorPicker.Trigger>
          <Input size="xs"
            aria-label={(ariaLabel ?? "颜色") + "值"}
            value={hexDraft}
            placeholder={placeholder ?? (allowAlpha ? "#RRGGBBAA" : "#RRGGBB")}
            disabled={disabled}
            minW={0}
            flex={1}
            h="30px"
            px="8px"
            bg={theme.bgSunken}
            color={theme.textPrimary}
            border={"1px solid " + theme.border}
            borderRadius="6px"
            fontFamily="monospace"
            fontSize="12px"
            onFocus={() => setHexFocused(true)}
            onChange={(event) => setHexDraft(event.target.value)}
            onBlur={() => {
              setHexFocused(false);
              if (cancelHexBlur.current) {
                cancelHexBlur.current = false;
                return;
              }
              commitHex();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                cancelHexBlur.current = true;
                setHexDraft(value);
                event.currentTarget.blur();
              }
            }}
          />
        </ChakraColorPicker.Control>
        <Portal container={portalRef}>
          <ChakraColorPicker.Positioner zIndex={10000}>
            <ChakraColorPicker.Content
              aria-label={(ariaLabel ?? "颜色") + "面板"}
              w="256px"
              p="12px"
              gap="10px"
              bg={theme.bgElevated}
              color={theme.textPrimary}
              border={"1px solid " + theme.borderStrong}
              borderRadius="8px"
              boxShadow="0 12px 32px rgba(0, 0, 0, 0.25)"
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Text fontSize="12px" fontWeight="semibold">编辑颜色</Text>
              <ChakraColorPicker.Area
                aria-label="饱和度与明度"
                h="148px"
                borderRadius="5px"
                onPointerDownCapture={() => { pointerEditing.current = true; }}
                onPointerUp={finishPointer}
                onPointerCancel={finishPointer}
              >
                <ChakraColorPicker.AreaBackground />
                <ChakraColorPicker.AreaThumb aria-label="饱和度与明度" />
              </ChakraColorPicker.Area>
              <Flex direction="column" gap="8px">
                <ChakraColorPicker.ChannelSlider
                  channel="hue"
                  h="14px"
                  onPointerDownCapture={() => { pointerEditing.current = true; }}
                  onPointerUp={finishPointer}
                  onPointerCancel={finishPointer}
                >
                  <ChakraColorPicker.ChannelSliderTrack />
                  <ChakraColorPicker.ChannelSliderThumb aria-label="色相" />
                </ChakraColorPicker.ChannelSlider>
                {allowAlpha && (
                  <ChakraColorPicker.ChannelSlider
                    channel="alpha"
                    h="14px"
                    onPointerDownCapture={() => { pointerEditing.current = true; }}
                    onPointerUp={finishPointer}
                    onPointerCancel={finishPointer}
                  >
                    <ChakraColorPicker.TransparencyGrid size="6px" />
                    <ChakraColorPicker.ChannelSliderTrack />
                    <ChakraColorPicker.ChannelSliderThumb aria-label="透明度" />
                  </ChakraColorPicker.ChannelSlider>
                )}
              </Flex>
              <NativeSelect.Root size="xs" variant="plain" w="90px">
                <NativeSelect.Field
                  aria-label="颜色输入格式"
                  value={mode}
                  color={theme.textPrimary}
                  onChange={(event) => setMode(event.currentTarget.value as EditMode)}
                >
                  <option value="rgba">{allowAlpha ? "RGBA" : "RGB"}</option>
                  <option value="hsla">{allowAlpha ? "HSLA" : "HSL"}</option>
                  <option value="hsba">{allowAlpha ? "HSBA" : "HSB"}</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator color={theme.textMuted} />
              </NativeSelect.Root>
              <Flex gap="6px">
                {(mode === "rgba" ? ["red", "green", "blue"] :
                  mode === "hsla" ? ["hue", "saturation", "lightness"] :
                  ["hue", "saturation", "brightness"]).map((channel) => (
                  <ChakraColorPicker.ChannelInput
                    key={channel}
                    channel={channel as "red"}
                    aria-label={channel}
                    minW={0}
                    flex={1}
                    h="28px"
                    px="5px"
                    bg={theme.bgSunken}
                    color={theme.textPrimary}
                    border={"1px solid " + theme.border}
                    borderRadius="4px"
                    fontSize="11px"
                    textAlign="center"
                  />
                ))}
                {allowAlpha && (
                  <ChakraColorPicker.ChannelInput
                    channel="alpha"
                    aria-label="透明度"
                    minW={0}
                    flex={1}
                    h="28px"
                    px="5px"
                    bg={theme.bgSunken}
                    color={theme.textPrimary}
                    border={"1px solid " + theme.border}
                    borderRadius="4px"
                    fontSize="11px"
                    textAlign="center"
                  />
                )}
              </Flex>
            </ChakraColorPicker.Content>
          </ChakraColorPicker.Positioner>
        </Portal>
      </ChakraColorPicker.Root>
    </Box>
  );
}
