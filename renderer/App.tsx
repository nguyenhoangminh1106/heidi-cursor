import React, { useEffect, useState } from "react";
import { AgentState, LinkedWindow } from "../src/types/agent";
import "./App.css";
import Controls from "./components/Controls";
import FieldPreview from "./components/FieldPreview";
import "./electron.d";

function App() {
  const [state, setState] = useState<AgentState>({
    status: "idle",
    sessionFields: [],
    currentIndex: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [linkedEmrWindow, setLinkedEmrWindow] = useState<
    LinkedWindow | undefined
  >();

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
        if (update.state.linkedEmrWindow !== undefined) {
          setLinkedEmrWindow(update.state.linkedEmrWindow);
        }
        if (update.state.lastError) {
          setError(update.state.lastError);
          setTimeout(() => setError(null), 5000);
        } else {
          setError(null);
        }
      }
    });

    // Get initial linked window status
    window.electronAPI.agent
      .getLinkedEmrWindow()
      .then((result) => {
        setLinkedEmrWindow(result.window);
      })
      .catch((err) => {
        console.error("Error getting linked window:", err);
      });

    return () => {
      // Cleanup if needed
    };
  }, []);

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

  const handleCaptureAndEnrich = async () => {
    setIsCapturing(true);
    setError(null);
    try {
      const result = await window.electronAPI.agent.captureAndEnrich();
      if (!result.success && result.error) {
        setError(result.error);
        setTimeout(() => setError(null), 5000);
      } else {
        setError(null);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleClearSession = async () => {
    try {
      await window.electronAPI.agent.clearSession();
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    }
  };

  const sessionFields = state?.sessionFields || [];
  const currentFieldIndex = state?.currentIndex ?? 0;
  const currentField =
    sessionFields.length > 0 && currentFieldIndex < sessionFields.length
      ? sessionFields[currentFieldIndex]
      : null;
  const nextField =
    sessionFields.length > 0 && currentFieldIndex + 1 < sessionFields.length
      ? sessionFields[currentFieldIndex + 1]
      : null;

  return (
    <div className="app">
      <div className="app-header">
        <h1>Heidi Cursor Agent</h1>
        <div className="status-badge" data-status={state?.status || "idle"}>
          {state?.status === "idle" && "Ready"}
          {state?.status === "capturing" && "Capturing..."}
          {state?.status === "typing" && "Typing..."}
          {state?.status === "error" && "Error"}
        </div>
      </div>

      {sessionFields.length > 0 && (
        <div className="progress-indicator">
          Field {currentFieldIndex + 1} of {sessionFields.length}
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

      {linkedEmrWindow ? (
        <div className="emr-link-status">
          ✓ Linked to: <strong>{linkedEmrWindow.appName}</strong> –{" "}
          {linkedEmrWindow.windowTitle.length > 40
            ? linkedEmrWindow.windowTitle.substring(0, 40) + "..."
            : linkedEmrWindow.windowTitle}
        </div>
      ) : (
        <div className="emr-link-status emr-link-status-warning">
          ⚠️ Not linked to EMR window. Click the floating icon to connect.
        </div>
      )}

      <FieldPreview
        currentField={currentField}
        nextField={nextField}
        currentIndex={currentFieldIndex}
        totalFields={sessionFields.length}
      />

      <Controls
        status={state?.status || "idle"}
        onCaptureAndEnrich={handleCaptureAndEnrich}
        onClearSession={handleClearSession}
        isCapturing={isCapturing}
        hasSession={sessionFields.length > 0}
      />

      <div className="shortcuts-hint">
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
          Keyboard Shortcuts (Option-based workflow)
        </div>
        <div>⌥C: Capture screen and enrich session</div>
        <div>⌥W: Move selection up</div>
        <div>⌥S: Move selection down</div>
        <div>⌥V: Type current field</div>
        <div>⌥X: Clear session</div>
        <div
          style={{
            fontSize: "9px",
            color: "#999",
            marginTop: "8px",
            fontStyle: "italic",
          }}
        >
          Generic bidirectional workflow: capture from any app, navigate fields,
          and type into any app.
        </div>
        <button
          className="btn-debug"
          onClick={() => {
            setShowDebugPanel(!showDebugPanel);
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
            maxHeight: "800px",
            overflowY: "auto",
            fontSize: "12px",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
            Session Fields ({sessionFields.length})
          </div>
          {sessionFields.length === 0 ? (
            <div style={{ color: "#666" }}>
              No fields captured yet. Press ⌥C to capture screen.
            </div>
          ) : (
            sessionFields.map((field, idx) => {
              const isCurrent = idx === currentFieldIndex;
              return (
                <div
                  key={field.id || idx}
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
                  {field.source && (
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#999",
                        marginTop: "4px",
                      }}
                    >
                      Source: {field.source}
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
