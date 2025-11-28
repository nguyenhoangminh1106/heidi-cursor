import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  agent: {
    start: () => Promise<void>;
    next: () => Promise<{ success: boolean; error?: string }>;
    reset: () => Promise<void>;
    setFields: (fields: Array<{ id: string; label: string; value: string }>) => Promise<void>;
    getState: () => Promise<{
      currentIndex: number;
      status: 'idle' | 'running' | 'completed';
      currentField: { id: string; label: string; value: string } | null;
      nextField: { id: string; label: string; value: string } | null;
      totalFields: number;
    }>;
    onStateUpdated: (callback: (state: {
      currentIndex: number;
      status: 'idle' | 'running' | 'completed';
      currentField: { id: string; label: string; value: string } | null;
      nextField: { id: string; label: string; value: string } | null;
      totalFields: number;
    }) => void) => void;
  };
}

const electronAPI: ElectronAPI = {
  agent: {
    start: () => ipcRenderer.invoke('agent:start'),
    next: () => ipcRenderer.invoke('agent:next'),
    reset: () => ipcRenderer.invoke('agent:reset'),
    setFields: (fields) => ipcRenderer.invoke('agent:set-fields', fields),
    getState: () => ipcRenderer.invoke('agent:get-state'),
    onStateUpdated: (callback) => {
      ipcRenderer.on('agent:state-updated', (_, state) => callback(state));
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

