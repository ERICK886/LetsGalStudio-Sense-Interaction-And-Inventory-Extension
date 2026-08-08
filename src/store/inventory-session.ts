/**
 * inventory-session.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 进程内库存会话：scene-interaction（存档真源）与 backpack-hud（UI）共享同一套库存。
 * SDK 无 save.cross，故用本桥接 + 绑定 SaveAPI 持久化。
 */

import { useCallback, useEffect, useState } from "react";
import type { SaveAPI } from "@avg-studio/sdk";
import {
  emptyInventory,
  parseInventoryJson,
  stringifyInventory,
} from "../domain/serialize";
import type { InventoryState } from "../domain/types";
import type { SceneInteractionSaveMap } from "./save-types";
import { notifySaveField, subscribeSaveField } from "./save-sync";

type InventoryListener = () => void;

/** 当前会话库存（内存） */
let sessionInventory: InventoryState = emptyInventory();

/** 订阅者 */
const listeners = new Set<InventoryListener>();

/**
 * 已绑定的 scene-interaction SaveAPI；写入会话时同步落盘。
 */
let boundSave: SaveAPI<SceneInteractionSaveMap> | null = null;

/**
 * 广播会话变更。
 */
function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * 从已绑定存档拉取库存到会话（不落盘）。
 */
function pullFromBoundSave(): void {
  if (boundSave === null) {
    return;
  }

  try {
    const raw = boundSave.get("inventoryJson");
    sessionInventory = parseInventoryJson(
      typeof raw === "string" ? raw : '{"entries":[]}',
    );
  } catch {
    sessionInventory = emptyInventory();
  }

  emit();
}

/**
 * 是否已绑定库存持久化真源（玩家 slot 或预览沙箱）。
 *
 * @returns true 表示已有 bindInventoryPersistence
 *
 * @example
 * ```ts
 * if (!isInventoryPersistenceBound()) {
 *   bindInventoryPersistence(createSettingsPreviewSave(ctx));
 * }
 * ```
 */
export function isInventoryPersistenceBound(): boolean {
  return boundSave !== null;
}

/**
 * 将 scene-interaction 的 save 绑定为库存持久化真源。
 *
 * 玩家游戏传入 slot SaveAPI；预览传入 createSettingsPreviewSave（扩展 settings）。
 *
 * @param save - SceneInteractionSaveMap 存档 API
 * @returns 解绑函数
 *
 * @example
 * ```ts
 * useEffect(() => bindInventoryPersistence(save), [save]);
 * ```
 */
export function bindInventoryPersistence(
  save: SaveAPI<SceneInteractionSaveMap>,
): () => void {
  boundSave = save;
  pullFromBoundSave();

  const unsub = subscribeSaveField((key) => {
    if (key === "inventoryJson" && boundSave === save) {
      pullFromBoundSave();
    }
  });

  return () => {
    unsub();

    if (boundSave === save) {
      boundSave = null;
    }
  };
}

/**
 * 读取当前会话库存快照。
 *
 * @returns InventoryState（只读语义，勿直接 mutate）
 */
export function getInventorySession(): InventoryState {
  return sessionInventory;
}

/**
 * 写入会话库存；若已绑定 save 则同步 inventoryJson。
 *
 * @param next - 新库存
 */
export function setInventorySession(next: InventoryState): void {
  sessionInventory = next;

  if (boundSave !== null) {
    try {
      boundSave.set("inventoryJson", stringifyInventory(next));
      notifySaveField("inventoryJson");
    } catch {
      // 绑定失效时仍保留内存态
    }
  }

  emit();
}

/**
 * 订阅会话库存变更。
 *
 * @param listener - 回调
 * @returns 取消订阅
 */
export function subscribeInventorySession(
  listener: InventoryListener,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * React Hook：读写共享库存会话（供 backpack-hud；场景壳亦可改用）。
 *
 * @returns `[inventory, setInventory]`
 *
 * @example
 * ```tsx
 * const [inventory, setInventory] = useInventorySession();
 * ```
 */
export function useInventorySession(): [
  InventoryState,
  (next: InventoryState) => void,
] {
  const [inventory, setLocal] = useState<InventoryState>(() =>
    getInventorySession(),
  );

  useEffect(() => {
    setLocal(getInventorySession());

    return subscribeInventorySession(() => {
      setLocal(getInventorySession());
    });
  }, []);

  const setInventory = useCallback((next: InventoryState) => {
    setInventorySession(next);
  }, []);

  return [inventory, setInventory];
}
