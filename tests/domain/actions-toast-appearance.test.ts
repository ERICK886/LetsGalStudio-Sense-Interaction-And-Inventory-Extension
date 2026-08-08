/**
 * actions-toast-appearance.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 验证 giveItem 动作成功后，会把动作级 Toast 外观覆盖传给 enqueueToast。
 */
import { describe, expect, it, vi } from "vitest";
import { executeSceneActions } from "../../src/domain/actions";
import { defaultElementMotion } from "../../src/domain/motion";

describe("executeSceneActions giveItem toast overrides", () => {
  it("成功发放时把覆盖字段传给 enqueueToast", () => {
    const enqueueToast = vi.fn();
    executeSceneActions(
      [
        {
          type: "giveItem",
          itemId: "i1",
          amount: 1,
          toastText: "钥匙",
          toastMotion: defaultElementMotion(),
          toastPlacement: "left",
          toastOffsetX: 2,
          toastGap: 16,
          toastStyle: { color: "#abc" },
        },
      ],
      "hs1",
      {
        openScene: () => true,
        giveItem: () => true,
        enqueueToast,
        warn: vi.fn(),
      },
    );
    expect(enqueueToast).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "钥匙",
        anchorHotspotId: "hs1",
        placement: "left",
        offsetX: 2,
        gap: 16,
        style: { color: "#abc" },
      }),
    );
  });
});
