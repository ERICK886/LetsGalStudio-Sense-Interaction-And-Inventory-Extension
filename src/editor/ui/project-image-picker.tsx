import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@chakra-ui/react";
import { useExtensionContext } from "@avg-studio/sdk";
import { useTheme } from "../../theme/theme-provider";
import { resolveContextAssetUrl } from "../../shared/resolve-context-asset-url";
import { projectResourcePath } from "../../shared/project-resource-reference";
import { readProjectImageResources, type ProjectImageResource } from "../project-image-resources";
import { editorButtonProps } from "./editor-control-styles";
import { EditorResourcePicker } from "./editor-resource-picker";

/** 图片字段适配器：SDK 读取与业务写回分离，所有图片字段共用资源选择组件。 */
export function ProjectImagePicker({ value, label, onChange }: {
  value: string; label: string; onChange: (path: string) => void;
}): React.ReactElement {
  const ctx = useExtensionContext();
  const { tokens } = useTheme();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [images, setImages] = useState<ProjectImageResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const setTrigger = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    setContainer(node?.closest<HTMLElement>("[data-extension-editor-root]") ?? null);
  }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setImages([]);
    readProjectImageResources(ctx.asset, controller.signal).then((result) => {
      if (!controller.signal.aborted) setImages(result);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(
        cause instanceof Error ? cause.message : "工程图片读取失败，请刷新重试。",
      );
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [open, revision, ctx.asset]);
  const normalizedValue = projectResourcePath(value) ?? value;
  const selectedPath = images.find(({ id, path }) => id === normalizedValue || path === normalizedValue)?.path ?? value;
  return <>
    <Button {...editorButtonProps(tokens)} ref={setTrigger} size="xs" h="28px" w="100%" variant="outline"
      type="button" aria-label={label + "：选择资源"} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)}>选择资源</Button>
    {open && container ? <EditorResourcePicker title={"选择图片 · " + label} value={selectedPath}
      resources={images} loading={loading} error={error} container={container} trigger={triggerRef.current}
      resolveUrl={(path) => resolveContextAssetUrl(ctx, path)}
      onRefresh={() => setRevision((current) => current + 1)}
      onPick={(path) => { onChange(path); setOpen(false); }} onClose={() => setOpen(false)} /> : null}
  </>;
}
