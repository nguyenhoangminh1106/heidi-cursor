import { contextBridge, ipcRenderer } from "electron";
import { AgentState } from "./types/agent";

export interface ElectronAPI {
  agent: {
    captureAndEnrich: () => Promise<{
      success: boolean;
      error?: string;
    }>;
    selectPreviousField: () => Promise<{ success: boolean }>;
    selectNextField: () => Promise<{ success: boolean }>;
    pasteCurrentField: () => Promise<{ success: boolean }>;
    clearSession: () => Promise<{ success: boolean }>;
    getState: () => Promise<{ state: AgentState }>;
    onStateUpdated: (callback: (update: { state: AgentState }) => void) => void;
  };
}

const electronAPI: ElectronAPI = {
  agent: {
    captureAndEnrich: () => ipcRenderer.invoke("agent:captureAndEnrich"),
    selectPreviousField: () => ipcRenderer.invoke("agent:selectPreviousField"),
    selectNextField: () => ipcRenderer.invoke("agent:selectNextField"),
    pasteCurrentField: () => ipcRenderer.invoke("agent:pasteCurrentField"),
    clearSession: () => ipcRenderer.invoke("agent:clearSession"),
    getState: () => ipcRenderer.invoke("agent:getState"),
    onStateUpdated: (callback) => {
      ipcRenderer.on("agent:stateUpdated", (_, update) => callback(update));
    },
  },
};

try {
  contextBridge.exposeInMainWorld("electronAPI", electronAPI);
  console.log("[PRELOAD] electronAPI exposed successfully");
} catch (error) {
  console.error("[PRELOAD] Error exposing electronAPI:", error);
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
