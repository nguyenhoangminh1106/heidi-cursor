import React, { useEffect, useState } from "react";
import { LinkedWindow } from "../../src/types/agent";
import "./IconApp.css";
import heidiIcon from "../assets/heidi-icon.svg";

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
          <img src={heidiIcon} alt="Heidi" className="icon-logo" />
          {linkedWindow && <div className="icon-badge">✓</div>}
        </div>
      </div>
    </div>
  );
}

export default IconApp;

