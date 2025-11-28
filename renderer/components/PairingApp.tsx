import React, { useEffect, useState } from "react";
import { LinkedWindow } from "../../src/types/agent";
import "./PairingApp.css";

function PairingApp() {
  const [windows, setWindows] = useState<LinkedWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<LinkedWindow | null>(
    null
  );

  const loadWindows = async () => {
    if (!window.electronAPI?.agent) {
      setError("Electron API not available");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await window.electronAPI.agent.listWindows();
      setWindows(result.windows || []);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load windows";
      setError(errorMessage);
      console.error("Error loading windows:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWindows();
  }, []);

  const handleSelectWindow = (targetWindow: LinkedWindow) => {
    setSelectedWindow(targetWindow);
    setError(null);
  };

  const handleConnect = async () => {
    if (!selectedWindow) {
      return;
    }

    if (!window.electronAPI?.agent) {
      setError("Electron API not available");
      return;
    }

    try {
      const result = await window.electronAPI.agent.setLinkedEmrWindow(
        selectedWindow
      );
      if (result.success) {
        // Window will close automatically via main process
      } else {
        setError("Failed to link EMR window");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to link window";
      setError(errorMessage);
      console.error("Error linking window:", err);
    }
  };

  return (
    <div className="pairing-app">
      <div className="pairing-header">
        <h1>Connect to EMR Window</h1>
        <p className="pairing-description">
          Select the EMR window you want to connect with. The Heidi Cursor Agent
          will work within this window's scope.
        </p>
      </div>

      {error && <div className="pairing-error">⚠️ {error}</div>}

      <div className="pairing-actions">
        <button
          className="btn-refresh"
          onClick={loadWindows}
          disabled={loading}
        >
          {loading ? "Loading..." : "🔄 Refresh"}
        </button>
        {selectedWindow && (
          <button
            className="btn-connect"
            onClick={handleConnect}
            disabled={loading}
          >
            Connect
          </button>
        )}
      </div>

      {loading ? (
        <div className="pairing-loading">Loading windows...</div>
      ) : windows.length === 0 ? (
        <div className="pairing-empty">
          No windows found. Make sure your EMR application is open and visible.
        </div>
      ) : (
        <div className="pairing-grid">
          {windows.map((window, index) => {
            const isSelected =
              selectedWindow &&
              selectedWindow.appName === window.appName &&
              selectedWindow.windowTitle === window.windowTitle &&
              selectedWindow.index === window.index;
            return (
              <div
                key={`${window.appName}-${window.windowTitle}-${index}`}
                className={`pairing-window-tile ${
                  isSelected ? "selected" : ""
                }`}
                onClick={() => handleSelectWindow(window)}
              >
                <div className="window-tile-app">{window.appName}</div>
                <div className="window-tile-title" title={window.windowTitle}>
                  {window.windowTitle.length > 50
                    ? window.windowTitle.substring(0, 50) + "..."
                    : window.windowTitle}
                </div>
                {window.index !== undefined && (
                  <div className="window-tile-index">
                    Window #{window.index}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PairingApp;
