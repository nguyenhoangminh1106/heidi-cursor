import React, { useEffect, useState } from "react";
import { LinkedWindow } from "../../src/types/agent";
import "./IconApp.css";

function IconApp() {
  const [linkedWindow, setLinkedWindow] = useState<LinkedWindow | undefined>();

  useEffect(() => {
    // Get linked window status
    if (window.electronAPI?.agent) {
      window.electronAPI.agent
        .getLinkedEmrWindow()
        .then((result) => {
          setLinkedWindow(result.window);
        })
        .catch((err) => {
          console.error("Error getting linked window:", err);
        });
    }
  }, []);

  const handleClick = async () => {
    if (window.electronAPI?.ui) {
      await window.electronAPI.ui.iconClicked();
    }
  };

  return (
    <div className="icon-app">
      <div className="icon-drag-region" />
      <div className="icon-clickable" onClick={handleClick}>
        <div className="icon-circle">
          {linkedWindow ? (
            <div className="icon-badge">✓</div>
          ) : (
            <div className="icon-placeholder">H</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default IconApp;

