import type { Acquisition, Library } from "./types";

export type DesktopOpen = {
  acquisition?: Acquisition;
  library?: Library;
  error?: string;
};
type DesktopBridge = {
  platform: string;
  openFile: () => Promise<void>;
  openFolder: () => Promise<void>;
  openDroppedFile: (file: File) => Promise<void>;
  onOpen: (callback: (payload: DesktopOpen) => void) => () => void;
  ready: () => Promise<void>;
};
declare global {
  interface Window {
    c3dDesktop?: DesktopBridge;
  }
}
export const desktop = window.c3dDesktop;
