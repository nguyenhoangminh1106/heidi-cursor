import { contextBridge, ipcRenderer } from "electron";
import { AgentFieldMapping, AgentState } from "./types/agent";

export interface ElectronAPI {
  agent: {
    syncToField: () => Promise<{
      success: boolean;
      mapping?: AgentFieldMapping;
      error?: string;
      ocrText?: string;
      reasoning?: string;
    }>;
    fillNext: () => Promise<{
      success: boolean;
      error?: string;
      mapping?: AgentFieldMapping;
    }>;
    refreshHeidiData: () => Promise<{
      success: boolean;
      snapshot?: {
        source: "ocr" | "api" | "ai";
        capturedAt: number;
        fields: Array<{ id: string; label: string; value: string }>;
      };
      error?: string;
    }>;
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
    syncToField: () => ipcRenderer.invoke("agent:sync"),
    fillNext: () => ipcRenderer.invoke("agent:fillNext"),
    refreshHeidiData: () => ipcRenderer.invoke("agent:refreshHeidi"),
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
