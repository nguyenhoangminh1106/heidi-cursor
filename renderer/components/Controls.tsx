import React from 'react';
import './Controls.css';

interface ControlsProps {
  status: 'idle' | 'running' | 'completed';
  onStart: () => void;
  onNext: () => void;
  onReset: () => void;
}

function Controls({ status, onStart, onNext, onReset }: ControlsProps) {
  return (
    <div className="controls">
      {status === 'idle' && (
        <button className="btn btn-primary" onClick={onStart}>
          Start
        </button>
      )}

      {status === 'running' && (
        <>
          <button className="btn btn-secondary" onClick={onNext}>
            Next Field
          </button>
          <button className="btn btn-tertiary" onClick={onReset}>
            Reset
          </button>
        </>
      )}

      {status === 'completed' && (
        <button className="btn btn-primary" onClick={onReset}>
          Reset & Start Over
        </button>
      )}
    </div>
  );
}

export default Controls;

