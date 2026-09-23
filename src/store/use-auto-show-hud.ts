import { useEffect, useState } from "react";
import type { ExtensionContext } from "@avg-studio/sdk";
import { AUTO_SHOW_HUD_KEY, readAutoShowHud } from "./hud-settings";
import { subscribeSettingsField } from "./settings-sync";

/** 读取快捷栏自动显示设置，并同步插件编辑器中的即时切换。 */
export function useAutoShowHud(ctx: ExtensionContext): boolean {
  const [enabled, setEnabled] = useState(() => readAutoShowHud(ctx));

  useEffect(() => {
    const refresh = (): void => setEnabled(readAutoShowHud(ctx));
    refresh();
    return subscribeSettingsField((key) => {
      if (key === AUTO_SHOW_HUD_KEY) {
        refresh();
      }
    });
  }, [ctx]);

  return enabled;
}
