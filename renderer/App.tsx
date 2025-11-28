import React, { useEffect, useState } from "react";
import { AgentState } from "../src/types/agent";
import "./App.css";
import Controls from "./components/Controls";
import FieldPreview from "./components/FieldPreview";
import "./electron.d";

function App() {
  const [state, setState] = useState<AgentState>({
    status: "idle",
    currentIndex: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [isRefreshingHeidi, setIsRefreshingHeidi] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [heidiFields, setHeidiFields] = useState<
    Array<{
      id: string;
      label: string;
      value: string;
      type?: string;
      confidence?: number;
    }>
  >([]);

  useEffect(() => {
    // Wait for electronAPI to be available
    if (!window.electronAPI?.agent) {
      console.error("electronAPI not available");
      return;
    }

    // Get initial state
    window.electronAPI.agent
      .getState()
      .then((result) => {
        if (result && result.state) {
          setState(result.state);
        }
      })
      .catch((err) => {
        console.error("Error getting initial state:", err);
      });

    // Listen for state updates
    window.electronAPI.agent.onStateUpdated((update) => {
      if (update && update.state) {
        setState(update.state);
        if (update.state.lastError) {
          setError(update.state.lastError);
          setTimeout(() => setError(null), 5000);
        } else {
          setError(null);
        }
      }
    });

    // Load Heidi snapshot on mount
    loadHeidiSnapshot();

    return () => {
      // Cleanup if needed
    };
  }, []);

  const loadHeidiSnapshot = async () => {
    try {
      const result = await window.electronAPI.agent.getHeidiSnapshot();
      if (result.success && result.snapshot) {
        setHeidiFields(result.snapshot.fields);
      }
    } catch (err) {
      console.error("Error loading Heidi snapshot:", err);
    }
  };

  const handlePrevField = async () => {
    try {
      await window.electronAPI.agent.selectPreviousField();
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleNextField = async () => {
    try {
      await window.electronAPI.agent.selectNextField();
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handlePasteCurrent = async () => {
    try {
      await window.electronAPI.agent.pasteCurrentField();
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleRefreshHeidi = async () => {
    setIsRefreshingHeidi(true);
    setError(null);
    try {
      if (!window.electronAPI?.agent?.refreshHeidiData) {
        throw new Error(
          "refreshHeidiData API not available. Please restart the app."
        );
      }
      const result = await window.electronAPI.agent.refreshHeidiData();
      if (!result.success && result.error) {
        setError(result.error);
        setTimeout(() => setError(null), 5000);
      } else {
        setError(null);
        if (result.snapshot) {
          console.log(
            "Heidi data refreshed:",
            result.snapshot.fields.length,
            "fields"
          );
          setHeidiFields(result.snapshot.fields);
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsRefreshingHeidi(false);
    }
  };

  const currentFieldIndex = state?.currentIndex ?? 0;
  const currentField =
    heidiFields.length > 0 && currentFieldIndex < heidiFields.length
      ? heidiFields[currentFieldIndex]
      : null;
  const nextField =
    heidiFields.length > 0 && currentFieldIndex + 1 < heidiFields.length
      ? heidiFields[currentFieldIndex + 1]
      : null;

  return (
    <div className="app">
      <div className="app-header">
        <h1>Heidi Cursor Agent</h1>
        <div className="status-badge" data-status={state?.status || "idle"}>
          {state?.status === "idle" && "Ready"}
          {state?.status === "synced" && "Ready"}
          {state?.status === "filling" && "Filling"}
          {state?.status === "error" && "Error"}
        </div>
      </div>

      {heidiFields.length > 0 && (
        <div className="progress-indicator">
          Field {currentFieldIndex + 1} of {heidiFields.length}
        </div>
      )}

      {error && (
        <div className="error-banner">
          ⚠️ {error}
          {error.includes("accessibility") && (
            <div className="error-hint">
              Grant accessibility permissions in System Settings → Privacy &
              Security → Accessibility
            </div>
          )}
        </div>
      )}

      <FieldPreview
        currentField={currentField}
        nextField={nextField}
        currentIndex={currentFieldIndex}
        totalFields={heidiFields.length}
      />

      <Controls
        status={state?.status || "idle"}
        onRefreshHeidi={handleRefreshHeidi}
        onPrevField={handlePrevField}
        onNextField={handleNextField}
        onPasteCurrent={handlePasteCurrent}
        isRefreshingHeidi={isRefreshingHeidi}
      />

      <div className="shortcuts-hint">
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
          Keyboard Shortcuts (Ctrl+Shift workflow)
        </div>
        <div>Ctrl+Shift+C: Capture Heidi (extract fields)</div>
        <div>Ctrl+Shift+W: Move selection up</div>
        <div>Ctrl+Shift+S: Move selection down</div>
        <div>Ctrl+Shift+P: Type current field</div>
        <div style={{ fontSize: "10px", color: "#666", marginTop: "4px" }}>
          ⌘⇧H: Refresh Heidi (alternative)
        </div>
        <div
          style={{
            fontSize: "9px",
            color: "#999",
            marginTop: "8px",
            fontStyle: "italic",
          }}
        >
          Note: This is a simplified Heidi-only workflow. Navigate Heidi fields
          and paste into EMR fields manually as needed.
        </div>
        <button
          className="btn-debug"
          onClick={() => {
            setShowDebugPanel(!showDebugPanel);
            if (!showDebugPanel) {
              loadHeidiSnapshot();
            }
          }}
          style={{
            marginTop: "8px",
            padding: "4px 8px",
            fontSize: "11px",
            background: "#666",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {showDebugPanel ? "Hide" : "Show"} Debug
        </button>
      </div>

      {showDebugPanel && (
        <div
          style={{
            marginTop: "12px",
            padding: "12px",
            background: "#f5f5f5",
            borderRadius: "8px",
            maxHeight: "400px",
            overflowY: "auto",
            fontSize: "12px",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
            Heidi Fields ({heidiFields.length})
          </div>
          {heidiFields.length === 0 ? (
            <div style={{ color: "#666" }}>No fields extracted yet</div>
          ) : (
            heidiFields.map((field, idx) => {
              const isCurrent = idx === currentFieldIndex;
              return (
                <div
                  key={idx}
                  style={{
                    marginBottom: "8px",
                    padding: "8px",
                    background: "white",
                    borderRadius: "4px",
                    border: isCurrent ? "2px solid #4CAF50" : "1px solid #ddd",
                  }}
                >
                  <div
                    style={{
                      fontWeight: isCurrent ? "bold" : "normal",
                      color: "#333",
                    }}
                  >
                    {idx + 1}. {field.label} ({field.id})
                    {isCurrent && " ← Current"}
                  </div>
                  <div
                    style={{
                      color: "#666",
                      fontSize: "11px",
                      marginTop: "4px",
                    }}
                  >
                    {field.value.length > 100
                      ? field.value.substring(0, 100) + "..."
                      : field.value}
                  </div>
                  {(field.type || field.confidence !== undefined) && (
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#999",
                        marginTop: "4px",
                      }}
                    >
                      {field.type && `Type: ${field.type}`}
                      {field.type && field.confidence !== undefined && " • "}
                      {field.confidence !== undefined &&
                        `Confidence: ${(field.confidence * 100).toFixed(0)}%`}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default App;
