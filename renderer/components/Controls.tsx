import React from 'react';
import './Controls.css';
import { AgentStatus } from '../../src/types/agent';

interface ControlsProps {
  status: AgentStatus;
  onRefreshHeidi: () => void;
  onPrevField: () => void;
  onNextField: () => void;
  onPasteCurrent: () => void;
  isRefreshingHeidi: boolean;
}

function Controls({ 
  status, 
  onRefreshHeidi,
  onPrevField,
  onNextField,
  onPasteCurrent,
  isRefreshingHeidi 
}: ControlsProps) {
  return (
    <div className="controls">
      <button 
        className="btn btn-primary" 
        onClick={onRefreshHeidi} 
        disabled={isRefreshingHeidi}
      >
        {isRefreshingHeidi ? 'Refreshing...' : 'Refresh Heidi (Ctrl+Shift+C)'}
      </button>

      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button 
          className="btn btn-secondary" 
          onClick={onPrevField}
          title="Move selection up (Ctrl+Shift+W)"
        >
          ↑ Prev (Ctrl+Shift+W)
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={onNextField}
          title="Move selection down (Ctrl+Shift+S)"
        >
          ↓ Next (Ctrl+Shift+S)
        </button>
      </div>

      <button 
        className="btn btn-sync" 
        onClick={onPasteCurrent}
        style={{ marginTop: '8px' }}
        title="Type current field value (Ctrl+Shift+P)"
      >
        Type Current (Ctrl+Shift+P)
      </button>
    </div>
  );
}

export default Controls;
