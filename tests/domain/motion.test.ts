/**
 * motion.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 */
import { describe, it, expect } from "vitest";
import {
  defaultElementMotion,
  normalizeElementMotion,
} from "../../src/domain/motion";

describe("normalizeElementMotion", () => {
  it("缺省返回两侧 none", () => {
    const m = normalizeElementMotion(undefined);
    expect(m.enter.preset).toBe("none");
    expect(m.exit.preset).toBe("none");
  });

  it("非法 preset 回退 none", () => {
    const m = normalizeElementMotion({
      enter: { preset: "boom", delayMs: -1, durationMs: 99999 },
      exit: {},
    });
    expect(m.enter.preset).toBe("none");
    expect(m.enter.delayMs).toBe(0);
    expect(m.enter.durationMs).toBeLessThanOrEqual(10_000);
  });

  it("defaultElementMotion 可被 JSON 往返", () => {
    const d = defaultElementMotion();
    expect(normalizeElementMotion(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});
