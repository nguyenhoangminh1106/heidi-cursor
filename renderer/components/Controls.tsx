import React from 'react';
import './Controls.css';

interface ControlsProps {
  // Props kept for compatibility but not used
  status?: any;
  onCaptureAndEnrich?: () => void;
  onClearSession?: () => void;
  isCapturing?: boolean;
  hasSession?: boolean;
}

function Controls(_props: ControlsProps) {
  // No buttons - keyboard-only interface
  return null;
}

export default Controls;
