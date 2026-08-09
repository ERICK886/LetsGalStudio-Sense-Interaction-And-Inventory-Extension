/**
 * inventory-session.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.2
 *
 * 进程内库存会话：scene-interaction（存档真源）与 backpack-hud（UI）共享同一套库存。
 * SDK 无 save.cross，故用本桥接 + 绑定 SaveAPI 持久化。
 *
 * 注意：跳转片段会 ui.hide 卸树再 show；宿主 save.get 有时仍返回默认空串。
 * 重绑时若 save 为空但会话仍有条目，保留内存并重新 save.set，避免物品「闪没」。
 * 背包模块的预览 SaveAPI 不得覆盖已登记的权威 slot（否则调试器 inventoryJson 一直空）。
 */

import { useCallback, useEffect, useState } from "react";
import type { SaveAPI } from "@avg-studio/sdk";
import {
  emptyInventory,
  parseInventoryJson,
  stringifyInventory,
} from "../domain/serialize";
import type { InventoryState } from "../domain/types";
import { logDebug, logWarn } from "../shared/logger";
import type { SceneInteractionSaveMap } from "./save-types";
import { notifySaveField, subscribeSaveField } from "./save-sync";
import {
  getSlotSave,
  registerSlotSave,
  writeSlotField,
} from "./slot-save-bridge";

export type BindInventoryPersistenceOptions = {
  /**
   * `true`：来自 backpack / 编辑器预览的内存壳，不得盖掉权威 slot。
   *
   * @default false
   */
  preview?: boolean;
};

type InventoryListener = () => void;

/** 当前会话库存（内存） */
let sessionInventory: InventoryState = emptyInventory();

/** 最近一次成功写入的 JSON（用于识别宿主是否丢了写回） */
let lastWrittenInventoryJson: string | null = null;

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
 * 库存是否含有条目。
 *
 * @param state - 库存
 */
function hasEntries(state: InventoryState): boolean {
  return state.entries.length > 0;
}

/**
 * 将当前会话写入已绑定存档（若有）。
 *
 * @param reason - 日志原因
 */
function pushSessionToBoundSave(reason: string): void {
  const json = stringifyInventory(sessionInventory);
  lastWrittenInventoryJson = json;
  const ok = writeSlotField("inventoryJson", json, boundSave);
  logDebug("inventory-session", "已写回 inventoryJson", {
    reason,
    entries: sessionInventory.entries.length,
    slotOk: ok,
  });
}

/**
 * 从已绑定存档拉取库存到会话（不落盘）。
 *
 * save 为空而会话仍有物品时：保留会话并重新 set（对抗 hide/show 后宿主丢写）。
 */
function pullFromBoundSave(): void {
  if (boundSave === null) {
    return;
  }

  let fromSave = emptyInventory();

  try {
    const raw = boundSave.get("inventoryJson");
    fromSave = parseInventoryJson(
      typeof raw === "string" ? raw : '{"entries":[]}',
    );
  } catch {
    fromSave = emptyInventory();
  }

  if (hasEntries(fromSave)) {
    sessionInventory = fromSave;
    lastWrittenInventoryJson = stringifyInventory(fromSave);
    emit();

    return;
  }

  if (hasEntries(sessionInventory) && lastWrittenInventoryJson !== null) {
    logWarn(
      "inventory-session",
      "save.inventoryJson 为空但会话仍有物品，重新写回（多为 ui.hide 重挂丢写）",
      { entries: sessionInventory.entries.length },
    );
    pushSessionToBoundSave("rebind-rescue");
    emit();

    return;
  }

  sessionInventory = fromSave;
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
 * 玩家游戏传入 slot SaveAPI；预览传入 createSettingsPreviewSave（库存仅内存）。
 * 若 `preview: true` 且已有权威 slot，则改绑到该 slot，避免只写内存壳。
 *
 * @param save - SceneInteractionSaveMap 存档 API
 * @param options - preview 标记（背包 HUD / 全屏背包回退）
 * @returns 解绑函数
 *
 * @example
 * ```ts
 * useEffect(() => bindInventoryPersistence(save), [save]);
 * useEffect(
 *   () => bindInventoryPersistence(previewSave, { preview: true }),
 *   [previewSave],
 * );
 * ```
 */
export function bindInventoryPersistence(
  save: SaveAPI<SceneInteractionSaveMap>,
  options?: BindInventoryPersistenceOptions,
): () => void {
  const preview = options?.preview === true;
  const existingSlot = getSlotSave();

  /**
   * 背包模块 ctx 上的预览 SaveAPI 与调试器「场景交互系统」不是同一 VariableSystem。
   * 已有 slot 登记时必须绑过去，否则 UI 有物、调试器 inventoryJson 仍为 []。
   */
  const target =
    preview && existingSlot !== null ? existingSlot : save;

  boundSave = target;

  if (!(preview && existingSlot !== null)) {
    registerSlotSave(save, { authoritative: !preview });
  } else {
    logDebug("inventory-session", "预览绑定改用已登记 slot", {
      entries: sessionInventory.entries.length,
    });
  }

  pullFromBoundSave();

  const unsub = subscribeSaveField((key) => {
    if (key === "inventoryJson" && boundSave === target) {
      /**
       * 仅当 save 侧有实质内容时才拉取，避免「写完立刻被空 get 冲掉」。
       * （部分宿主 notify 后 get 仍短暂返回 default）
       */
      try {
        const raw = target.get("inventoryJson");
        const parsed = parseInventoryJson(
          typeof raw === "string" ? raw : '{"entries":[]}',
        );

        if (hasEntries(parsed) || !hasEntries(sessionInventory)) {
          pullFromBoundSave();
        }
      } catch {
        // 忽略
      }
    }
  });

  return () => {
    unsub();

    if (boundSave === target) {
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
  const json = stringifyInventory(next);
  lastWrittenInventoryJson = json;

  const ok = writeSlotField("inventoryJson", json, boundSave);

  if (ok) {
    logDebug("inventory-session", "setInventorySession → save", {
      entries: next.entries.length,
    });
  } else if (boundSave === null) {
    logDebug("inventory-session", "setInventorySession（未绑定 save，仅内存）", {
      entries: next.entries.length,
    });
  } else {
    logWarn(
      "inventory-session",
      "setInventorySession：写后读回失败（调试器 inventoryJson 可能仍为空）",
      { entries: next.entries.length },
    );
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
 * React Hook：读写共享库存会话（供 backpack-hud 与场景壳）。
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
