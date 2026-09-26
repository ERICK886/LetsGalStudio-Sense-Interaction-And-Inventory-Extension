import React, { useEffect, useId, useState } from "react";
import { Button, Input, chakra } from "@chakra-ui/react";
import { useExtensionContext } from "@avg-studio/sdk";
import { useTheme } from "../../theme/theme-provider";
import { resolveContextAssetUrl } from "../../shared/resolve-context-asset-url";
import { readProjectImageResources, type ProjectImageResource } from "../project-image-resources";
import { editorButtonProps, editorInputProps } from "./editor-control-styles";

/** 内联图片选择器，跟随属性面板缩放，避免宿主 Portal 坐标与层级干扰。 */
export function ProjectImagePicker({ value, label, onChange }: {
  value: string;
  label: string;
  onChange: (path: string) => void;
}): React.ReactElement {
  const ctx = useExtensionContext();
  const { tokens } = useTheme();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [images, setImages] = useState<ProjectImageResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setImages([]);
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

  const query = search.trim().toLowerCase();
  const matching = images.filter((image) => image.path.toLowerCase().includes(query));
  return (
    <>
      <Button {...editorButtonProps(tokens)} size="xs" h="28px" w="100%" variant="outline"
        type="button" aria-label={label + "：选择资源"} aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen(!open)}>选择资源</Button>
      {open ? (
        <chakra.div id={panelId} role="region" aria-label={label + "：工程图片资源"}
          style={{ padding: 8, minWidth: 0, border: "1px solid " + tokens.border, borderRadius: 6, background: tokens.bgSunken }}>
          <chakra.div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Input {...editorInputProps(tokens)} size="xs" h="28px" flex="1" minW={0}
              aria-label="搜索工程图片" value={search} placeholder="搜索名称或文件夹"
              onChange={(event) => setSearch(event.target.value)} />
            <Button {...editorButtonProps(tokens)} size="xs" h="28px" type="button"
              disabled={loading} onClick={() => setRevision((current) => current + 1)}>刷新</Button>
          </chakra.div>
          <chakra.div role="status" style={{ marginTop: 6, color: tokens.textMuted, fontSize: 11 }}>
            {loading ? "正在读取工程图片…" : error ? "" : "工程图片 " + images.length + " 张"}
          </chakra.div>
          {error ? <chakra.div role="alert" style={{ marginTop: 6, color: tokens.textPrimary, fontSize: 11 }}>{error}</chakra.div> : null}
          {!loading && !error ? (
            <>
              <chakra.div style={{ maxHeight: 260, overflowY: "auto", marginTop: 7, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
                {matching.map((image) => (
                  <Button {...editorButtonProps(tokens)} key={image.id} size="xs" variant="outline" type="button"
                    title={image.path} aria-label={image.path} aria-pressed={value === image.path}
                    borderColor={value === image.path ? tokens.accent : tokens.border}
                    onClick={() => { onChange(image.path); setOpen(false); }}
                    style={{ height: 100, minWidth: 0, width: "100%", display: "flex", flexDirection: "column", gap: 3, padding: 4 }}>
                    <chakra.img src={resolveContextAssetUrl(ctx, image.path)} alt="" loading="lazy"
                      style={{ maxWidth: "100%", height: 55, objectFit: "contain" }} />
                    <chakra.span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{image.name}</chakra.span>
                    <chakra.span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: tokens.textMuted, fontSize: 10 }}>{image.path}</chakra.span>
                  </Button>
                ))}
              </chakra.div>
              {matching.length === 0 ? <chakra.div style={{ padding: 8, color: tokens.textMuted, fontSize: 11 }}>
                {images.length === 0 ? "暂无工程图片，请在 Studio 资产页导入图片后刷新。" : "没有匹配的工程图片。"}
              </chakra.div> : null}
            </>
          ) : null}
        </chakra.div>
      ) : null}
    </>
  );
}
