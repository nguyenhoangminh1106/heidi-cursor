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

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

