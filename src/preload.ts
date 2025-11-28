import { contextBridge, ipcRenderer } from "electron";
import { AgentState } from "./types/agent";

export interface ElectronAPI {
  agent: {
    refreshHeidiData: () => Promise<{
      success: boolean;
      snapshot?: {
        source: "ocr" | "api" | "ai";
        capturedAt: number;
        fields: Array<{ id: string; label: string; value: string }>;
      };
      error?: string;
    }>;
    selectPreviousField: () => Promise<{ success: boolean }>;
    selectNextField: () => Promise<{ success: boolean }>;
    pasteCurrentField: () => Promise<{ success: boolean }>;
    getState: () => Promise<{ state: AgentState }>;
    getHeidiSnapshot: () => Promise<{
      success: boolean;
      snapshot?: {
        source: "ocr" | "api" | "ai";
        capturedAt: number;
        fields: Array<{
          id: string;
          label: string;
          value: string;
          type?: string;
          confidence?: number;
        }>;
      };
      error?: string;
    }>;
    onStateUpdated: (callback: (update: { state: AgentState }) => void) => void;
  };
}

const electronAPI: ElectronAPI = {
  agent: {
    refreshHeidiData: () => ipcRenderer.invoke("agent:refreshHeidi"),
    selectPreviousField: () => ipcRenderer.invoke("agent:selectPreviousField"),
    selectNextField: () => ipcRenderer.invoke("agent:selectNextField"),
    pasteCurrentField: () => ipcRenderer.invoke("agent:pasteCurrentField"),
    getState: () => ipcRenderer.invoke("agent:getState"),
    getHeidiSnapshot: () => ipcRenderer.invoke("agent:getHeidiSnapshot"),
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
