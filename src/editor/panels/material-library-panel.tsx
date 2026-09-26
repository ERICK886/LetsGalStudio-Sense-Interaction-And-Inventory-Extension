import { Button, Input, chakra } from "@chakra-ui/react";
import React, { useEffect, useRef, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import { useMaterialLibrary } from "../material-library-context";
import type { MaterialKind } from "../material-library";
import { EditorSelect, EditorSelectOption } from "../ui/editor-select";
import { materialReference } from "../../shared/material-reference";
import { resolveContextAssetUrl } from "../../shared/resolve-context-asset-url";
import { useTheme } from "../../theme/theme-provider";

const KIND_LABELS: Record<MaterialKind, string> = {
  scene: "场景底图", hotspot: "交互点", item: "物品", other: "其他图片",
};

/** 作者素材库：导入图片到扩展 assets/materials 并展示自动生成的清单。 */
export function MaterialLibraryPanel(): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const { entries, root, busy, error, connectRoot, importFiles, importUri } = useMaterialLibrary();
  const [draftRoot, setDraftRoot] = useState(root);
  const [kind, setKind] = useState<MaterialKind>("scene");
  const [sourceUri, setSourceUri] = useState("");
  const [query, setQuery] = useState("");
  const visibleEntries = entries.filter((entry) => entry.name.toLowerCase().includes(query.trim().toLowerCase()));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraftRoot(root); }, [root]);

  return (
    <chakra.main data-testid="material-library-panel" style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 20, background: tokens.bgBase, color: tokens.textPrimary }}>
      <chakra.div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <chakra.h2 style={{ fontSize: 18, margin: "0 0 6px" }}>素材库</chakra.h2>
        <chakra.p style={{ fontSize: 12, color: tokens.textMuted, margin: "0 0 18px" }}>
          图片保存在扩展的 assets/materials，清单自动生成。场景、交互点和物品属性可直接选用；原有工程资源路径仍可使用。
        </chakra.p>

        <chakra.div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: 12, border: `1px solid ${tokens.border}`, borderRadius: 8, background: tokens.bgElevated }}>
          <chakra.label htmlFor="material-root" style={{ fontSize: 12, fontWeight: 600 }}>扩展源目录</chakra.label>
          <Input id="material-root" size="sm" value={draftRoot} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraftRoot(event.target.value)}
            placeholder="包含 extension.json 的扩展目录绝对路径"
            style={{ flex: "1 1 420px", minWidth: 220, color: tokens.textPrimary, background: tokens.bgSunken, border: `1px solid ${tokens.border}` }} />
          <Button size="sm" disabled={busy || !draftRoot.trim()} onClick={() => { void connectRoot(draftRoot).catch(() => {}); }}>
            {root ? "重新连接" : "连接目录"}
          </Button>
          <chakra.p style={{ width: "100%", margin: 0, color: tokens.textMuted, fontSize: 11 }}>
            目录必须是本扩展的源码目录；路径只记在这台电脑，绝不写入游戏设置或存档。
          </chakra.p>
        </chakra.div>

        <chakra.div style={{ display: "flex", gap: 8, alignItems: "center", margin: "18px 0", flexWrap: "wrap" }}>
          <chakra.span style={{ fontSize: 12 }}>导入类别</chakra.span>
          <chakra.div style={{ width: 140 }}>
            <EditorSelect value={kind} onChange={(event) => setKind(event.target.value as MaterialKind)} aria-label="导入类别">
              {Object.entries(KIND_LABELS).map(([value, label]) => <EditorSelectOption key={value} value={value}>{label}</EditorSelectOption>)}
            </EditorSelect>
          </chakra.div>
          <Input ref={inputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            style={{ display: "none" }} data-testid="material-file-input"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              const files: File[] = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (files.length) void importFiles(files, kind).catch(() => {});
            }} />
          <Button size="sm" disabled={!root || busy} onClick={() => inputRef.current?.click()} data-testid="material-import-button">
            {busy ? "正在处理…" : "导入图片"}
          </Button>
          <chakra.span style={{ fontSize: 11, color: tokens.textMuted }}>支持 PNG、JPEG、WebP、GIF、AVIF；单张不超过 25 MB</chakra.span>
        </chakra.div>

        <chakra.div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18 }}>
          <Input size="sm" value={sourceUri} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSourceUri(event.target.value)}
            placeholder="也可填写工程图片路径（ui/…、asset://…）或图片 URL"
            style={{ flex: 1, minWidth: 0, color: tokens.textPrimary, background: tokens.bgSunken }} />
          <Button size="sm" disabled={!root || busy || !sourceUri.trim()} onClick={() => {
            void importUri(sourceUri, kind).then(() => setSourceUri("")).catch(() => {});
          }}>收录已有图片</Button>
        </chakra.div>

        {error && <chakra.p role="alert" style={{ color: "#f87171", fontSize: 12 }}>{error}</chakra.p>}
        <chakra.div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <chakra.span style={{ fontSize: 12, color: tokens.textMuted, flexShrink: 0 }}>已收录 {entries.length} 张图片</chakra.span>
          <Input size="sm" value={query} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="搜索素材名称" style={{ maxWidth: 260 }} />
        </chakra.div>
        {entries.length === 0 ? (
          <chakra.div style={{ padding: 30, textAlign: "center", color: tokens.textMuted, border: `1px dashed ${tokens.borderStrong}`, borderRadius: 8 }}>
            素材库为空。连接扩展源目录后导入图片。
          </chakra.div>
        ) : (
          <chakra.div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {visibleEntries.map((entry) => (
              <chakra.div key={entry.id} style={{ minWidth: 0, padding: 8, borderRadius: 8, border: `1px solid ${tokens.border}`, background: tokens.bgElevated }}>
                <chakra.div style={{ height: 112, display: "flex", alignItems: "center", justifyContent: "center", background: tokens.bgSunken, borderRadius: 5 }}>
                  <chakra.img src={resolveContextAssetUrl(ctx, materialReference(entry.path))} alt={entry.name}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                </chakra.div>
                <chakra.div title={entry.name} style={{ marginTop: 7, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</chakra.div>
                <chakra.div style={{ marginTop: 3, fontSize: 11, color: tokens.textMuted }}>{KIND_LABELS[entry.kind]} · {Math.ceil(entry.size / 1024)} KB</chakra.div>
              </chakra.div>
            ))}
          </chakra.div>
        )}
      </chakra.div>
    </chakra.main>
  );
}
