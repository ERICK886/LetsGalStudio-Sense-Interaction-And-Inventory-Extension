import React, { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Dialog, Flex, Image, Input, Portal, Text } from "@chakra-ui/react";
import { useTheme } from "../../theme/theme-provider";
import type { ProjectImageResource } from "../project-image-resources";
import { editorButtonProps, editorInputProps } from "./editor-control-styles";
import { buildResourceCategories, filterResources, resourceGridWindow, RESOURCE_ROW_HEIGHT } from "./resource-picker-model";

export interface EditorResourcePickerProps {
  title: string;
  value: string;
  resources: readonly ProjectImageResource[];
  loading: boolean;
  error: string;
  container: HTMLElement;
  trigger: HTMLElement | null;
  resolveUrl: (path: string) => string;
  onRefresh: () => void;
  onPick: (path: string) => void;
  onClose: () => void;
}

/** Studio 风格的资源浏览器；Portal 与坐标均局限于未缩放的插件根节点。 */
export function EditorResourcePicker({
  title, value, resources, loading, error, container, trigger, resolveUrl, onRefresh, onPick, onClose,
}: EditorResourcePickerProps): React.ReactElement {
  const { tokens } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);
  const portalRef = useMemo(() => ({ current: container }), [container]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const categories = useMemo(() => buildResourceCategories(resources), [resources]);
  const filtered = useMemo(() => filterResources(resources, category, deferredQuery), [resources, category, deferredQuery]);
  useEffect(() => {
    if (category && !categories.some(({ id }) => id === category)) setCategory(null);
  }, [category, categories]);

  const categoryButton = (id: string | null, label: string, count: number) => (
    <Button key={id ?? "all"} {...editorButtonProps(tokens)} type="button" variant="ghost"
      h="30px" w="100%" minW={0} justifyContent="space-between" fontSize="12px" px="8px"
      borderColor="transparent" bg={category === id ? tokens.bgSunken : "transparent"}
      color={category === id ? tokens.accent : tokens.textSecondary}
      title={label + "（" + count + "）"} aria-pressed={category === id} aria-label={"资源分类：" + label}
      onClick={() => { setCategory(id); setQuery(""); }}>
      <Text m={0} truncate>{label}</Text><Text m={0} fontSize="11px" color={tokens.textMuted}>{count}</Text>
    </Button>
  );

  return (
    <Dialog.Root open lazyMount unmountOnExit preventScroll={false} motionPreset="none"
      initialFocusEl={() => searchRef.current} finalFocusEl={() => trigger}
      onOpenChange={({ open }) => { if (!open) onClose(); }}>
      <Portal container={portalRef}>
        <Dialog.Backdrop position="absolute" inset={0} w="100%" h="100%" zIndex={10000} bg="rgba(0,0,0,0.48)" />
        <Dialog.Positioner position="absolute" inset={0} w="100%" h="100%" maxH="100%" zIndex={10001} p="16px"
          display="flex" alignItems="center" justifyContent="center" pointerEvents="none" boxSizing="border-box">
          <Dialog.Content data-testid="editor-resource-picker" position="relative" m={0}
            w="min(1120px, 100%)" maxW="100%" h="min(760px, 100%)" maxH="100%" minH={0}
            display="flex" flexDirection="column" overflow="hidden" pointerEvents="auto" boxSizing="border-box"
            bg={tokens.bgElevated} color={tokens.textPrimary} border={"1px solid " + tokens.borderStrong}
            borderRadius="8px" boxShadow="0 16px 48px rgba(0,0,0,0.28)" fontFamily="inherit"
            onKeyDown={(event) => event.stopPropagation()}>
            <Dialog.Header p="10px 14px" borderBottom={"1px solid " + tokens.border} flexShrink={0}>
              <Flex align="center" w="100%" minW={0} gap="8px">
                <Dialog.Title m={0} flex={1} truncate fontSize="14px">{title}</Dialog.Title>
                <Text m={0} fontSize="11px" color={tokens.textMuted}>项目素材</Text>
                <Button {...editorButtonProps(tokens)} h="28px" type="button" aria-label="关闭资源选择器"
                  title="关闭" onClick={onClose}>×</Button>
              </Flex>
            </Dialog.Header>
            <Flex px="14px" py="8px" gap="8px" align="center" borderBottom={"1px solid " + tokens.border} flexShrink={0}>
              <Input {...editorInputProps(tokens)} ref={searchRef} value={query} flex={1}
                aria-label="搜索工程图片" placeholder="搜索文件名或路径（支持空格组合关键词）"
                onChange={(event) => setQuery(event.target.value)} />
              <Button {...editorButtonProps(tokens)} type="button" h="32px" disabled={loading} onClick={onRefresh}>刷新</Button>
            </Flex>
            <Dialog.Body display="flex" p={0} flex={1} minH={0} minW={0}>
              <Box w="clamp(100px, 20%, 180px)" flexShrink={0} bg={tokens.bgBase}
                borderRight={"1px solid " + tokens.border} overflowY="auto" p="6px">
                <Text m={0} px="8px" py="6px" fontSize="11px" color={tokens.textMuted}>资源分类</Text>
                {categoryButton(null, "全部素材", resources.length)}
                {categories.map(({ id, label, count }) => categoryButton(id, label, count))}
              </Box>
              <Flex direction="column" flex={1} minW={0} minH={0}>
                <Flex px="16px" py="8px" gap="8px" flexShrink={0} fontSize="11px" color={tokens.textMuted}>
                  <Text m={0} truncate>{query.trim() ? "全局搜索" : categories.find(({ id }) => id === category)?.label ?? "全部素材"}</Text>
                  <Text m={0} role="status" ml="auto" whiteSpace="nowrap">
                    {loading ? "正在读取…" : error ? "" : deferredQuery !== query ? "正在搜索…" : filtered.length + " / " + resources.length + " 张"}
                  </Text>
                </Flex>
                {loading ? <Text m={0} p="20px" color={tokens.textMuted} role="status">正在读取工程图片…</Text> :
                  error ? <Text m={0} p="20px" role="alert" fontSize="13px">{error}</Text> :
                    filtered.length === 0 ? <Text m={0} p="20px" color={tokens.textMuted} fontSize="13px">
                      {resources.length === 0 ? "暂无工程图片，请在 Studio 资产页导入图片后刷新。" : "没有匹配的素材，可以尝试更短的文件名或目录关键词。"}
                    </Text> :
                      <ResourceGrid resources={filtered} value={value} resolveUrl={resolveUrl} onPick={onPick}
                        navigationKey={category + ":" + deferredQuery} />}
              </Flex>
            </Dialog.Body>
            <Dialog.Footer px="14px" py="8px" gap="12px" borderTop={"1px solid " + tokens.border} flexShrink={0} minW={0}>
              <Text m={0} flex={1} truncate fontSize="11px" color={tokens.textMuted} title={value}>
                {value ? "当前：" + value : "尚未选择图片"}
              </Text>
              <Text m={0} fontSize="11px" color={tokens.textMuted}>点击图片应用</Text>
              <Button {...editorButtonProps(tokens)} type="button" h="28px" onClick={onClose}>取消</Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function ResourceGrid({ resources, value, resolveUrl, onPick, navigationKey }: {
  resources: readonly ProjectImageResource[]; value: string; resolveUrl: (path: string) => string;
  onPick: (path: string) => void; navigationKey: string;
}) {
  const { tokens } = useTheme();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 860, height: 560, scrollTop: 0 });
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const grid = resourceGridWindow(resources.length, viewport.width, viewport.height, viewport.scrollTop);
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => setViewport((previous) => ({ ...previous, width: node.clientWidth || 860, height: node.clientHeight || 560 }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    node.scrollTop = 0;
    setViewport((previous) => ({ ...previous, scrollTop: 0 }));
    setFocusIndex(null);
  }, [navigationKey]);
  useLayoutEffect(() => {
    if (focusIndex !== null) viewportRef.current?.querySelector<HTMLButtonElement>('[data-resource-index="' + focusIndex + '"]')?.focus({ preventScroll: true });
  }, [focusIndex, grid.start, grid.end]);

  function moveFocus(event: React.KeyboardEvent, index: number) {
    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 :
      event.key === "ArrowDown" ? grid.columns : event.key === "ArrowUp" ? -grid.columns : 0;
    const target = event.key === "Home" ? 0 : event.key === "End" ? resources.length - 1 : offset ? index + offset : null;
    if (target === null) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(resources.length - 1, target));
    const node = viewportRef.current;
    if (!node) return;
    const top = Math.floor(next / grid.columns) * RESOURCE_ROW_HEIGHT + 16;
    if (top < node.scrollTop) node.scrollTop = Math.max(0, top - 16);
    else if (top + RESOURCE_ROW_HEIGHT > node.scrollTop + viewport.height)
      node.scrollTop = top + RESOURCE_ROW_HEIGHT - viewport.height;
    setViewport((previous) => ({ ...previous, scrollTop: node.scrollTop }));
    setFocusIndex(next);
  }
  return (
    <Box ref={viewportRef} data-testid="resource-grid" flex={1} minH={0} minW={0} overflowY="auto"
      onScroll={(event) => {
        const scrollTop = event.currentTarget.scrollTop;
        setViewport((previous) => ({ ...previous, scrollTop }));
      }}>
      <Box position="relative" h={grid.height + "px"}>
        <Box position="absolute" top={grid.top + 16 + "px"} left="16px" right="16px"
          display="grid" gridTemplateColumns={"repeat(" + grid.columns + ", minmax(0, 1fr))"} gap="12px">
          {resources.slice(grid.start, grid.end).map((resource, offset) => (
            <Button key={resource.path} {...editorButtonProps(tokens)} type="button" variant="outline" p="6px"
              data-resource-index={grid.start + offset} aria-label={resource.path} aria-pressed={value === resource.path}
              title={resource.path} w="100%" minW={0} h="154px" display="flex" flexDirection="column" gap="4px"
              borderColor={value === resource.path ? tokens.accent : tokens.border}
              onKeyDown={(event) => moveFocus(event, grid.start + offset)} onClick={() => onPick(resource.path)}>
              <ResourceThumbnail key={resource.path} url={resolveUrl(resource.path)} />
              <Text m={0} w="100%" truncate textAlign="left" fontSize="12px">{resource.name}</Text>
              <Text m={0} w="100%" truncate textAlign="left" fontSize="10px" fontWeight={400} color={tokens.textMuted}>{resource.path}</Text>
            </Button>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
function ResourceThumbnail({ url }: { url: string }) {
  const { tokens } = useTheme();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return <Flex align="center" justify="center" w="100%" h="100px" flexShrink={0} bg={tokens.bgBase} borderRadius="4px">
    {failed ? <Text m={0} fontSize="11px" color={tokens.textMuted}>图片无法读取</Text> :
      <Image src={url} alt="" loading="lazy" decoding="async" draggable={false}
        maxW="100%" maxH="100%" objectFit="contain" onError={() => setFailed(true)} />}
  </Flex>;
}
