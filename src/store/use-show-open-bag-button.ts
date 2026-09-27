import { useEffect, useState } from "react";
import type { ExtensionContext } from "@avg-studio/sdk";
import { SHOW_OPEN_BAG_BUTTON_KEY, readShowOpenBagButton } from "./hud-settings";
import { subscribeSettingsField } from "./settings-sync";

/** 读取全局背包按钮开关，并同步插件编辑器中的即时切换。 */
export function useShowOpenBagButton(ctx: ExtensionContext): boolean {
  const [enabled, setEnabled] = useState(() => readShowOpenBagButton(ctx));

  useEffect(() => {
    const refresh = (): void => setEnabled(readShowOpenBagButton(ctx));
    refresh();
    return subscribeSettingsField((key) => {
      if (key === SHOW_OPEN_BAG_BUTTON_KEY) {
        refresh();
      }
    });
  }, [ctx]);

  return enabled;
}
