import { Button, Input, chakra } from "@chakra-ui/react";
import React, { useEffect, useRef, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import { useMaterialLibrary } from "../material-library-context";
import type { MaterialKind } from "../material-library";
import { EditorSelect, EditorSelectOption } from "../ui/editor-select";
import { editorButtonProps, editorInputProps } from "../ui/editor-control-styles";
import { materialReference } from "../../shared/material-reference";
import { resolveContextAssetUrl } from "../../shared/resolve-context-asset-url";
import { useTheme } from "../../theme/theme-provider";
import { MaterialDetailsPanel, MATERIAL_KIND_LABELS } from "./material-details-panel";
import { collectMaterialUsage } from "../material-usage";

/** 作者素材库：导入图片到扩展 assets/materials 并展示自动生成的清单。 */
export function MaterialLibraryPanel(): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const { entries, trashEntries, usage, root, busy, error, connectRoot, canChooseRoot, chooseRoot, importFiles, importUri, refresh } = useMaterialLibrary();
  const [draftRoot, setDraftRoot] = useState(root);
  const [kind, setKind] = useState<MaterialKind>("scene");
  const [sourceUri, setSourceUri] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("library");
  const [category, setCategory] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const displayedEntries = view === "trash" ? trashEntries : entries;
  const usageCounts = new Map(displayedEntries.map((entry) => [entry.id, collectMaterialUsage(entry.path, usage.sources).length]));
  const visibleEntries = displayedEntries.filter((entry) =>
    entry.name.toLowerCase().includes(query.trim().toLowerCase()) &&
    (category === "all" || entry.kind === category) &&
    (usageFilter === "all" || (!usage.error && (usageFilter === "used" ? usageCounts.get(entry.id)! > 0 : usageCounts.get(entry.id) === 0))))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "zh-CN") : sort === "size" ? b.size - a.size :
      (Date.parse(b.trashedAt ?? b.createdAt) || 0) - (Date.parse(a.trashedAt ?? a.createdAt) || 0));
  const selectedEntry = displayedEntries.find((entry) => entry.id === selectedId);
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
          <Input {...editorInputProps(tokens)} id="material-root" size="sm" value={draftRoot} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraftRoot(event.target.value)}
            placeholder="包含 extension.json 的扩展目录绝对路径"
            style={{ flex: "1 1 420px", minWidth: 220 }} />
          <Button {...editorButtonProps(tokens)} size="sm" disabled={busy || !canChooseRoot} data-testid="material-choose-root"
            onClick={() => { void chooseRoot(draftRoot).catch(() => {}); }}>选择文件夹</Button>
          <Button {...editorButtonProps(tokens)} size="sm" disabled={busy || !draftRoot.trim()} onClick={() => { void connectRoot(draftRoot).catch(() => {}); }}>
            {root ? "重新连接" : "连接目录"}
          </Button>
          <chakra.p style={{ width: "100%", margin: 0, color: tokens.textMuted, fontSize: 11 }}>
            选择文件夹后自动校验并连接，也可手动填写路径。目录须包含本扩展的 extension.json；路径只记在这台电脑。
            {!canChooseRoot && "当前环境不支持文件夹选择，请手动填写路径。"}
          </chakra.p>
        </chakra.div>

        <chakra.div style={{ display: "flex", gap: 8, alignItems: "center", margin: "18px 0", flexWrap: "wrap" }}>
          <chakra.span style={{ fontSize: 12 }}>导入类别</chakra.span>
          <chakra.div style={{ width: 140 }}>
            <EditorSelect value={kind} onChange={(event) => setKind(event.target.value as MaterialKind)} aria-label="导入类别">
              {Object.entries(MATERIAL_KIND_LABELS).map(([value, label]) => <EditorSelectOption key={value} value={value}>{label}</EditorSelectOption>)}
            </EditorSelect>
          </chakra.div>
          <Input ref={inputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            style={{ display: "none" }} data-testid="material-file-input"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              const files: File[] = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (files.length) void importFiles(files, kind).catch(() => {});
            }} />
          <Button {...editorButtonProps(tokens)} size="sm" disabled={!root || busy} onClick={() => inputRef.current?.click()} data-testid="material-import-button">
            {busy ? "正在处理…" : "导入图片"}
          </Button>
          <chakra.span style={{ fontSize: 11, color: tokens.textMuted }}>支持 PNG、JPEG、WebP、GIF、AVIF；单张不超过 25 MB</chakra.span>
        </chakra.div>

        <chakra.div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18 }}>
          <Input {...editorInputProps(tokens)} size="sm" value={sourceUri} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSourceUri(event.target.value)}
            placeholder="也可填写工程图片路径（ui/…、asset://…）或图片 URL"
            style={{ flex: 1, minWidth: 0 }} />
          <Button {...editorButtonProps(tokens)} size="sm" disabled={!root || busy || !sourceUri.trim()} onClick={() => {
            void importUri(sourceUri, kind).then(() => setSourceUri("")).catch(() => {});
          }}>收录已有图片</Button>
        </chakra.div>

        {error && <chakra.p role="alert" style={{ color: "#f87171", fontSize: 12 }}>{error}</chakra.p>}
        <chakra.div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <Button {...editorButtonProps(tokens)} aria-pressed={view === "library"} borderColor={view === "library" ? tokens.accent : tokens.border} onClick={() => { setView("library"); setSelectedId(null); }}>素材（{entries.length}）</Button>
          <Button {...editorButtonProps(tokens)} aria-pressed={view === "trash"} borderColor={view === "trash" ? tokens.accent : tokens.border} onClick={() => { setView("trash"); setSelectedId(null); }}>回收站（{trashEntries.length}）</Button>
          <Input {...editorInputProps(tokens)} size="sm" aria-label="搜索素材名称" value={query} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="搜索素材名称" style={{ maxWidth: 260 }} />
          <chakra.div style={{ width: 130 }}><EditorSelect value={category} aria-label="筛选素材类别" onChange={(event) => setCategory(event.target.value)}>
            <EditorSelectOption value="all">全部类别</EditorSelectOption>
            {Object.entries(MATERIAL_KIND_LABELS).map(([value, label]) => <EditorSelectOption key={value} value={value}>{label}</EditorSelectOption>)}
          </EditorSelect></chakra.div>
          <chakra.div style={{ width: 120 }}><EditorSelect value={usageFilter} aria-label="筛选引用状态" onChange={(event) => setUsageFilter(event.target.value)}>
            <EditorSelectOption value="all">全部引用状态</EditorSelectOption><EditorSelectOption value="used">已使用</EditorSelectOption><EditorSelectOption value="unused">未使用</EditorSelectOption>
          </EditorSelect></chakra.div>
          <chakra.div style={{ width: 130 }}><EditorSelect value={sort} aria-label="素材排序" onChange={(event) => setSort(event.target.value)}>
            <EditorSelectOption value="newest">最近添加</EditorSelectOption><EditorSelectOption value="name">按名称</EditorSelectOption><EditorSelectOption value="size">按文件大小</EditorSelectOption>
          </EditorSelect></chakra.div>
          <Button {...editorButtonProps(tokens)} disabled={busy} onClick={() => { void refresh().catch(() => {}); }}>刷新</Button>
        </chakra.div>
        {usage.error && <chakra.p role="alert" style={{ color: tokens.textSecondary, fontSize: 12 }}>引用检查暂不可用，删除功能已禁用：{usage.error}</chakra.p>}
        <chakra.p style={{ margin: "0 0 10px", color: tokens.textMuted, fontSize: 11 }}>显示 {visibleEntries.length} / {displayedEntries.length} 张图片。选择素材可预览、修改名称和类别、复制引用及查看使用位置。</chakra.p>
        {visibleEntries.length === 0 && (
          <chakra.div style={{ padding: 30, textAlign: "center", color: tokens.textMuted, border: `1px dashed ${tokens.borderStrong}`, borderRadius: 8 }}>
            {displayedEntries.length ? "没有符合筛选条件的素材。" : view === "trash" ? "回收站为空。" : "素材库为空。连接扩展源目录后导入图片。"}
          </chakra.div>
        )}
        <chakra.div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <chakra.div style={{ flex: "1 1 280px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {visibleEntries.map((entry) => (
              <Button {...editorButtonProps(tokens)} key={entry.id} aria-pressed={selectedId === entry.id} title={entry.name} onClick={() => setSelectedId(entry.id)}
                bg={tokens.bgElevated} borderColor={selectedId === entry.id ? tokens.accent : tokens.border}
                style={{ minWidth: 0, height: "auto", padding: 8, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 0, textAlign: "left" }}>
                <chakra.span style={{ height: 112, display: "flex", alignItems: "center", justifyContent: "center", background: tokens.bgSunken, borderRadius: 5 }}>
                  <chakra.img src={resolveContextAssetUrl(ctx, materialReference(entry.path))} alt={entry.name}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                </chakra.span>
                <chakra.span style={{ marginTop: 7, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</chakra.span>
                <chakra.span style={{ marginTop: 3, fontSize: 11, color: tokens.textMuted }}>{MATERIAL_KIND_LABELS[entry.kind]} · {Math.ceil(entry.size / 1024)} KB</chakra.span>
                <chakra.span style={{ marginTop: 3, fontSize: 11, color: tokens.textMuted }}>{usage.error ? "引用状态未知" : usageCounts.get(entry.id) ? `${usageCounts.get(entry.id)} 处引用` : "未使用"}</chakra.span>
              </Button>
            ))}
          </chakra.div>
          {selectedEntry && <MaterialDetailsPanel key={selectedEntry.id} entry={selectedEntry} />}
        </chakra.div>
      </chakra.div>
    </chakra.main>
  );
}
