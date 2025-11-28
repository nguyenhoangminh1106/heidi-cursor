import { contextBridge, ipcRenderer } from "electron";
import { AgentState, LinkedWindow } from "./types/agent";

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
    listWindows: () => Promise<{ windows: LinkedWindow[] }>;
    setLinkedEmrWindow: (window: LinkedWindow) => Promise<{ success: boolean }>;
    getLinkedEmrWindow: () => Promise<{ window?: LinkedWindow }>;
    addSessionFields: (
      fields: any[]
    ) => Promise<{ success: boolean; error?: string }>;
  };
  ui: {
    iconClicked: () => Promise<void>;
  };
  heidi: {
    // Patient Profiles
    createPatientProfile: (
      profile: any
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    getPatientProfile: (
      id: string
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    updatePatientProfile: (
      id: string,
      profile: any
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    createPatientProfileFromEmr: () => Promise<{
      ok: boolean;
      data?: any;
      error?: string;
    }>;
    // Sessions
    createSession: (
      session: any
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    getSession: (
      sessionId: string
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    getSessionOverview: (
      sessionId: string
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    getSessionContext: (
      sessionId: string
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    getSessionCoding: (
      sessionId: string
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    // Transcription
    getSessionTranscription: (
      sessionId: string
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    // Consult Notes
    getSessionConsultNotes: (
      sessionId: string
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    // Documents
    getSessionDocuments: (
      sessionId: string
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    createDocument: (
      sessionId: string,
      documentInput: any
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    // Ask Heidi
    askHeidi: (
      request: any
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
    // Legacy alias
    fetchSession: (
      sessionId: string
    ) => Promise<{ ok: boolean; data?: any; error?: string }>;
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
    listWindows: () => ipcRenderer.invoke("agent:listWindows"),
    setLinkedEmrWindow: (window: LinkedWindow) =>
      ipcRenderer.invoke("agent:setLinkedEmrWindow", window),
    getLinkedEmrWindow: () => ipcRenderer.invoke("agent:getLinkedEmrWindow"),
    addSessionFields: (fields: any[]) =>
      ipcRenderer.invoke("agent:addSessionFields", fields),
  },
  ui: {
    iconClicked: () => ipcRenderer.invoke("ui:iconClicked"),
  },
  heidi: {
    // Patient Profiles
    createPatientProfile: (profile: any) =>
      ipcRenderer.invoke("heidi:createPatientProfile", profile),
    getPatientProfile: (id: string) =>
      ipcRenderer.invoke("heidi:getPatientProfile", id),
    updatePatientProfile: (id: string, profile: any) =>
      ipcRenderer.invoke("heidi:updatePatientProfile", id, profile),
    createPatientProfileFromEmr: () =>
      ipcRenderer.invoke("heidi:createPatientProfileFromEmr"),
    // Sessions
    createSession: (session: any) =>
      ipcRenderer.invoke("heidi:createSession", session),
    getSession: (sessionId: string) =>
      ipcRenderer.invoke("heidi:getSession", sessionId),
    getSessionOverview: (sessionId: string) =>
      ipcRenderer.invoke("heidi:getSessionOverview", sessionId),
    getSessionContext: (sessionId: string) =>
      ipcRenderer.invoke("heidi:getSessionContext", sessionId),
    getSessionCoding: (sessionId: string) =>
      ipcRenderer.invoke("heidi:getSessionCoding", sessionId),
    // Transcription
    getSessionTranscription: (sessionId: string) =>
      ipcRenderer.invoke("heidi:getSessionTranscription", sessionId),
    // Consult Notes
    getSessionConsultNotes: (sessionId: string) =>
      ipcRenderer.invoke("heidi:getSessionConsultNotes", sessionId),
    // Documents
    getSessionDocuments: (sessionId: string) =>
      ipcRenderer.invoke("heidi:getSessionDocuments", sessionId),
    createDocument: (sessionId: string, documentInput: any) =>
      ipcRenderer.invoke("heidi:createDocument", sessionId, documentInput),
    // Ask Heidi
    askHeidi: (request: any) => ipcRenderer.invoke("heidi:askHeidi", request),
    // Legacy alias
    fetchSession: (sessionId: string) =>
      ipcRenderer.invoke("heidi:fetchSession", sessionId),
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
