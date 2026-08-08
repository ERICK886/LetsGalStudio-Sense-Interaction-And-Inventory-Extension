/**
 * player-session.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * player-session 门闩单测：begin/end 配对与 Promise 复用。
 */
import { describe, expect, it } from "vitest";
import {
  beginPlayerSessionWait,
  endPlayerSessionWait,
  isPlayerSessionPending,
} from "../../src/runtime/player-session";

describe("player-session", () => {
  it("end 解除 begin 的 await", async () => {
    const p = beginPlayerSessionWait();
    expect(isPlayerSessionPending()).toBe(true);
    queueMicrotask(() => endPlayerSessionWait());
    await p;
    expect(isPlayerSessionPending()).toBe(false);
  });

  it("重复 begin 复用同一 Promise", async () => {
    const a = beginPlayerSessionWait();
    const b = beginPlayerSessionWait();
    expect(a).toBe(b);
    endPlayerSessionWait();
    await a;
  });
});
