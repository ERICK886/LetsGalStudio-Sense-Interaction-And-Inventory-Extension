import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  MATERIAL_MANIFEST_PATH, parseMaterialManifest,
  MAX_MATERIAL_BYTES,
  type MaterialEntry, type MaterialKind,
} from "./material-library";
import { connectMaterialRoot, importMaterialFile } from "./material-storage";
import { resolveContextAssetUrl } from "../shared/resolve-context-asset-url";

const LOCAL_ROOT_KEY = "ink.zenly.ext-27b96b.material-root";

interface MaterialLibraryState {
  entries: MaterialEntry[];
  root: string;
  busy: boolean;
  error: string;
  connectRoot(path: string): Promise<void>;
  importFiles(files: readonly File[], kind: MaterialKind): Promise<void>;
  importUri(uri: string, kind: MaterialKind): Promise<void>;
}

const MaterialLibraryContext = createContext<MaterialLibraryState | null>(null);

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function MaterialLibraryProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const ctx = useExtensionContext();
  const [entries, setEntries] = useState<MaterialEntry[]>([]);
  const [root, setRoot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    busyRef.current = true;
    setBusy(true);
    const load = async (): Promise<void> => {
      let savedRoot = "";
      try { savedRoot = localStorage.getItem(LOCAL_ROOT_KEY) ?? ""; } catch { /* 仅本机记忆可选 */ }
      if (savedRoot) {
        try {
          const connected = await connectMaterialRoot(ctx, savedRoot);
          if (!cancelled) {
            setRoot(connected.root);
            setEntries(connected.manifest.materials);
          }
          return;
        } catch (failure) {
          if (!cancelled) setError(`上次连接的目录不可用：${message(failure)}`);
        }
      }
      try {
        const response = await fetch(ctx.extensionResource.url(MATERIAL_MANIFEST_PATH), { cache: "no-store" });
        if (!response.ok) {
          if (response.status !== 404) throw new Error(`读取素材清单失败：HTTP ${response.status}`);
          return;
        }
        const manifest = parseMaterialManifest(await response.json());
        if (!cancelled) setEntries(manifest.materials);
      } catch (failure) {
        if (!cancelled) setError(message(failure));
      }
    };
    void load().finally(() => {
      if (!cancelled) {
        busyRef.current = false;
        setBusy(false);
      }
    });
    return () => { cancelled = true; };
  }, [ctx]);

  const connectRoot = useCallback(async (input: string): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const connected = await connectMaterialRoot(ctx, input);
      setRoot(connected.root);
      setEntries(connected.manifest.materials);
      try { localStorage.setItem(LOCAL_ROOT_KEY, connected.root); } catch { /* 可不记忆 */ }
    } catch (failure) {
      setError(message(failure));
      throw failure;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [ctx]);

  const importFiles = useCallback(async (files: readonly File[], kind: MaterialKind): Promise<void> => {
    if (busyRef.current) return;
    if (!root) {
      setError("先连接当前扩展源目录，再导入图片");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      for (const file of files) {
        const manifest = await importMaterialFile(ctx, root, file, kind);
        setEntries(manifest.materials);
      }
    } catch (failure) {
      setError(message(failure));
      throw failure;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [ctx, root]);

  const importUri = useCallback(async (uri: string, kind: MaterialKind): Promise<void> => {
    if (busyRef.current) return;
    if (!root) {
      setError("先连接当前扩展源目录，再导入图片");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const url = resolveContextAssetUrl(ctx, uri.trim());
      if (!url) throw new Error("图片资源路径不能为空");
      const response = await fetch(url);
      if (!response.ok) throw new Error(`读取图片失败：HTTP ${response.status}`);
      if (Number(response.headers.get("content-length")) > MAX_MATERIAL_BYTES) {
        throw new Error("图片超过 25 MB");
      }
      const blob = await response.blob();
      const name = uri.trim().split(/[?#]/)[0].split("/").filter(Boolean).pop() || "项目图片";
      const manifest = await importMaterialFile(ctx, root, new File([blob], name, { type: blob.type }), kind);
      setEntries(manifest.materials);
    } catch (failure) {
      setError(message(failure));
      throw failure;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [ctx, root]);

  return (
    <MaterialLibraryContext.Provider value={{ entries, root, busy, error, connectRoot, importFiles, importUri }}>
      {children}
    </MaterialLibraryContext.Provider>
  );
}

export function useMaterialLibrary(): MaterialLibraryState {
  const value = useContext(MaterialLibraryContext);
  if (!value) throw new Error("素材库需要 MaterialLibraryProvider");
  return value;
}
