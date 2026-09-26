import { Button, Input, chakra } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import { useMaterialLibrary } from "../material-library-context";
import type { MaterialEntry, MaterialKind } from "../material-library";
import { collectMaterialUsage } from "../material-usage";
import { EditorSelect, EditorSelectOption } from "../ui/editor-select";
import { editorButtonProps, editorInputProps } from "../ui/editor-control-styles";
import { materialReference } from "../../shared/material-reference";
import { resolveContextAssetUrl } from "../../shared/resolve-context-asset-url";
import { useTheme } from "../../theme/theme-provider";

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  scene: "场景底图", hotspot: "交互点", item: "物品", other: "其他图片",
};

export function MaterialDetailsPanel({ entry }: { entry: MaterialEntry }): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const { root, busy, usage, updateEntry, trashEntry, restoreEntry } = useMaterialLibrary();
  const [name, setName] = useState(entry.name);
  const [kind, setKind] = useState(entry.kind);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const usages = collectMaterialUsage(entry.path, usage.sources);
  const reference = materialReference(entry.path);
  const writable = Boolean(root) && !busy;

  useEffect(() => {
    setName(entry.name); setKind(entry.kind); setConfirmTrash(false); setCopyMessage("");
  }, [entry.id, entry.name, entry.kind]);

  return (
    <chakra.aside data-testid="material-details-panel" style={{ width: 300, minWidth: 0, padding: 12, border: `1px solid ${tokens.border}`, borderRadius: 8, background: tokens.bgElevated }}>
      <chakra.h3 style={{ margin: "0 0 10px", fontSize: 14 }}>素材详情{entry.trashedAt ? " · 回收站" : ""}</chakra.h3>
      <chakra.div style={{ height: 190, display: "flex", alignItems: "center", justifyContent: "center", background: tokens.bgSunken, borderRadius: 6 }}>
        <chakra.img key={entry.path} src={resolveContextAssetUrl(ctx, reference)} alt={entry.name}
          onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      </chakra.div>
      <chakra.p style={{ margin: "8px 0 12px", color: tokens.textMuted, fontSize: 11 }}>
        {entry.mime} · {Math.ceil(entry.size / 1024)} KB{natural ? ` · ${natural.width} × ${natural.height}` : ""}
      </chakra.p>
      <chakra.div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <chakra.label htmlFor="material-detail-name" style={{ fontSize: 12 }}>名称</chakra.label>
        <Input {...editorInputProps(tokens)} id="material-detail-name" value={name} maxLength={120}
          disabled={!writable || Boolean(entry.trashedAt)} onChange={(event) => setName(event.target.value)} />
        <chakra.span style={{ fontSize: 12 }}>类别</chakra.span>
        <EditorSelect value={kind} disabled={!writable || Boolean(entry.trashedAt)} aria-label="素材类别" onChange={(event) => setKind(event.target.value as MaterialKind)}>
          {Object.entries(MATERIAL_KIND_LABELS).map(([value, label]) => <EditorSelectOption key={value} value={value}>{label}</EditorSelectOption>)}
        </EditorSelect>
        {!entry.trashedAt && <Button {...editorButtonProps(tokens)} disabled={!writable || !name.trim() || (name.trim() === entry.name && kind === entry.kind)}
          onClick={() => { void updateEntry(entry.id, name, kind).catch(() => {}); }}>保存名称和类别</Button>}
        <chakra.label htmlFor="material-detail-reference" style={{ fontSize: 12 }}>资源引用</chakra.label>
        <Input {...editorInputProps(tokens)} id="material-detail-reference" readOnly value={reference} onFocus={(event) => event.currentTarget.select()} />
        <Button {...editorButtonProps(tokens)} onClick={async () => {
          try { await navigator.clipboard.writeText(reference); setCopyMessage("引用已复制"); }
          catch { setCopyMessage("复制失败，可选中上方引用后手动复制"); }
        }}>复制引用</Button>
        {copyMessage && <chakra.span role="status" style={{ fontSize: 11, color: tokens.textMuted }}>{copyMessage}</chakra.span>}
        <chakra.h4 style={{ margin: "6px 0 0", fontSize: 12 }}>当前项目引用（{usages.length}）</chakra.h4>
        {usage.error ? <chakra.p role="alert" style={{ margin: 0, fontSize: 11, color: tokens.textSecondary }}>无法检查引用：{usage.error}</chakra.p>
          : usages.length ? <chakra.ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, maxHeight: 160, overflowY: "auto" }}>
            {usages.map((item, index) => <chakra.li key={index} style={{ overflowWrap: "anywhere", marginBottom: 5 }}>{item.label}<chakra.div style={{ color: tokens.textMuted }}>{item.field}</chakra.div></chakra.li>)}
          </chakra.ul> : <chakra.p style={{ margin: 0, color: tokens.textMuted, fontSize: 11 }}>当前项目未引用这张图片。</chakra.p>}
        {!root && <chakra.p style={{ margin: 0, color: tokens.textMuted, fontSize: 11 }}>连接扩展源目录后可修改、删除或恢复素材。</chakra.p>}
        {entry.trashedAt ? <Button {...editorButtonProps(tokens)} disabled={!writable} onClick={() => { void restoreEntry(entry.id).catch(() => {}); }}>恢复素材</Button>
          : confirmTrash ? <chakra.div role="group" aria-label="确认删除素材" style={{ fontSize: 12, padding: 8, border: `1px solid ${tokens.borderStrong}`, borderRadius: 6 }}>
            <chakra.p style={{ margin: "0 0 8px" }}>将“{entry.name}”移入回收站？图片文件和引用路径会保留，可随时恢复。</chakra.p>
            <chakra.div style={{ display: "flex", gap: 8 }}>
              <Button {...editorButtonProps(tokens)} disabled={!writable || Boolean(usage.error) || usages.length > 0}
                onClick={() => { void trashEntry(entry.id).catch(() => {}); }}>确认移入</Button>
              <Button {...editorButtonProps(tokens)} disabled={busy} onClick={() => setConfirmTrash(false)}>取消</Button>
            </chakra.div>
          </chakra.div> : <Button {...editorButtonProps(tokens)} disabled={!writable || Boolean(usage.error) || usages.length > 0}
            title={usages.length ? "请先解除当前项目中的引用" : undefined} onClick={() => setConfirmTrash(true)}>删除到回收站</Button>}
      </chakra.div>
    </chakra.aside>
  );
}
