/**
 * smoke.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * Vitest 冒烟测试：确认测试脚手架可正常运行。
 */
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("works", () => {
    expect(1 + 1).toBe(2);
  });
});
