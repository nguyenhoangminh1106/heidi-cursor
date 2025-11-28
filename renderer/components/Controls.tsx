import React from 'react';
import './Controls.css';
import { AgentStatus } from '../../src/types/agent';

interface ControlsProps {
  status: AgentStatus;
  onSync: () => void;
  onFillNext: () => void;
  onRefreshHeidi: () => void;
  isSyncing: boolean;
  isRefreshingHeidi: boolean;
}

function Controls({ 
  status, 
  onSync, 
  onFillNext, 
  onRefreshHeidi,
  isSyncing,
  isRefreshingHeidi 
}: ControlsProps) {
  return (
    <div className="controls">
      <button 
        className="btn btn-sync" 
        onClick={onRefreshHeidi} 
        disabled={isRefreshingHeidi}
      >
        {isRefreshingHeidi ? 'Refreshing...' : 'Refresh Heidi'}
      </button>

      {status === 'idle' && (
        <button 
          className="btn btn-primary" 
          onClick={onSync} 
          disabled={isSyncing}
        >
          {isSyncing ? 'Syncing...' : 'Sync to Field'}
        </button>
      )}

      {(status === 'synced' || status === 'filling') && (
        <>
          <button 
            className="btn btn-sync" 
            onClick={onSync} 
            disabled={isSyncing}
          >
            {isSyncing ? 'Syncing...' : 'Sync'}
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={onFillNext}
          >
            Fill Next
          </button>
        </>
      )}

      {status === 'error' && (
        <button 
          className="btn btn-primary" 
          onClick={onSync} 
          disabled={isSyncing}
        >
          {isSyncing ? 'Syncing...' : 'Retry Sync'}
        </button>
      )}
    </div>
  );
}

export default Controls;
