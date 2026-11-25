import { useEffect, type RefObject } from "react";
import type { FrameRange } from "./workbench";

// Space plays or pauses; arrows step one frame (Shift: 10); Home / End jump to
// the observation range. Typing in form fields is left alone.
export function usePlaybackShortcuts(options: {
  enabled: boolean;
  frame: number;
  roi: FrameRange;
  seek: (frame: number) => void;
  togglePlay: () => void;
  pause: () => void;
}) {
  const { enabled, frame, roi, seek, togglePlay, pause } = options;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        !enabled ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
      if (e.code === "ArrowRight") {
        e.preventDefault();
        pause();
        seek(frame + (e.shiftKey ? 10 : 1));
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        pause();
        seek(frame - (e.shiftKey ? 10 : 1));
      }
      if (e.code === "Home") {
        e.preventDefault();
        seek(roi[0]);
      }
      if (e.code === "End") {
        e.preventDefault();
        seek(roi[1]);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [enabled, frame, roi, seek, togglePlay, pause]);
}

// Moves focus into an open dialog, keeps Tab inside it, closes on Escape and
// restores the previous focus afterwards. `dialog` identifies the open dialog.
export function useDialogFocus(
  dialog: string | null,
  ref: RefObject<HTMLDivElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    (
      element?.querySelector<HTMLElement>("button, select, input, a[href]") ||
      element
    )?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && element) {
        const focusable = [
          ...element.querySelectorAll<HTMLElement>(
            "button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], [tabindex='0']",
          ),
        ];
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      previous?.focus();
    };
    // Re-run only when a different dialog opens, as before.
  }, [dialog]);
}
