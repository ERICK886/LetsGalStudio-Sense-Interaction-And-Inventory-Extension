import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface PopoverPosition {
  x: number;
  y: number;
  width: number;
  placed: boolean;
}

interface Size {
  width: number;
  height: number;
}

/** 将视口矩形换算到插件根节点的未缩放坐标系。 */
export function getEditorPopoverCoordinates(
  triggerRect: DOMRect,
  rootRect: DOMRect,
  rootSize: Size,
  popoverSize: Size,
): Pick<PopoverPosition, "x" | "y" | "width"> {
  const scaleX = rootRect.width / rootSize.width || 1;
  const scaleY = rootRect.height / rootSize.height || 1;
  const width = triggerRect.width / scaleX;
  const left = (triggerRect.left - rootRect.left) / scaleX;
  const below = (triggerRect.bottom - rootRect.top) / scaleY + 4;
  const above = (triggerRect.top - rootRect.top) / scaleY - popoverSize.height - 4;
  const y = below + popoverSize.height <= rootSize.height
    ? below
    : above >= 0 ? above : Math.max(0, rootSize.height - popoverSize.height);
  return {
    x: Math.max(0, Math.min(left, rootSize.width - popoverSize.width)),
    y,
    width,
  };
}

/**
 * Studio 的扩展舞台经过 transform 缩放。Zag 在该宿主中可能未写入弹层坐标变量，
 * 因此保留 Chakra 的交互与弹层结构，并在插件根节点内计算实际位置。
 */
export function useEditorPopoverPosition() {
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [positioner, setPositioner] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({
    x: 0, y: 0, width: 0, placed: false,
  });

  const triggerRef = useCallback((node: HTMLElement | null) => {
    setTrigger(node);
    setContainer(node?.closest<HTMLElement>("[data-extension-editor-root]") ?? null);
  }, []);
  const positionerRef = useCallback((node: HTMLDivElement | null) => {
    setPositioner(node);
  }, []);
  const portalRef = useMemo(() => ({ current: container }), [container]);

  useClientLayoutEffect(() => {
    if (!open || !trigger || !container || !positioner) return;
    const update = () => {
      const rootSize = { width: container.offsetWidth, height: container.offsetHeight };
      if (!rootSize.width || !rootSize.height) return;
      const next = getEditorPopoverCoordinates(
        trigger.getBoundingClientRect(),
        container.getBoundingClientRect(),
        rootSize,
        { width: positioner.offsetWidth, height: positioner.offsetHeight },
      );
      setPosition((previous) => previous.placed &&
        previous.x === next.x && previous.y === next.y && previous.width === next.width
        ? previous : { ...next, placed: true });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(trigger);
    observer.observe(container);
    observer.observe(positioner);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, trigger, container, positioner]);

  const onOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) setPosition((previous) => ({ ...previous, placed: false }));
    setOpen(nextOpen);
  }, []);

  const positionerStyle = useMemo(() => ({
    "--x": String(position.x) + "px",
    "--y": String(position.y) + "px",
    "--reference-width": String(position.width) + "px",
    "--z-index": "10000",
    visibility: position.placed ? "visible" : "hidden",
  }) as CSSProperties, [position]);

  return { open, onOpenChange, triggerRef, positionerRef, portalRef, positionerStyle };
}
