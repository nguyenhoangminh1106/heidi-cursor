import React, { useEffect, useState } from "react";
import { AgentState } from "../src/types/agent";
import "./App.css";
import Controls from "./components/Controls";
import FieldPreview from "./components/FieldPreview";
import "./electron.d";

function App() {
  const [state, setState] = useState<AgentState>({
    status: "idle",
    mapping: [],
    currentIndex: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
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

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const result = await window.electronAPI.agent.syncToField();
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
      setIsSyncing(false);
    }
  };

  const handleFillNext = async () => {
    try {
      const result = await window.electronAPI.agent.fillNext();
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

  const currentMapping = state?.mapping?.[state.currentIndex] || null;
  const nextMapping = state?.mapping?.[state.currentIndex + 1] || null;

  return (
    <div className="app">
      <div className="app-header">
        <h1>Heidi Cursor Agent</h1>
        <div className="status-badge" data-status={state?.status || "idle"}>
          {state?.status === "idle" && "Ready"}
          {state?.status === "synced" && "Synced"}
          {state?.status === "filling" && "Filling"}
          {state?.status === "error" && "Error"}
        </div>
      </div>

      {state?.fillPlan && state.fillIndex !== undefined ? (
        <div className="progress-indicator">
          Field {state.fillIndex + 1} of {state.fillPlan.steps.length}
        </div>
      ) : state?.mapping && state.mapping.length > 0 ? (
        <div className="progress-indicator">
          Field {state.currentIndex + 1} of {state.mapping.length}
        </div>
      ) : null}

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
        currentMapping={currentMapping}
        nextMapping={nextMapping}
        agentState={state}
        heidiFields={heidiFields}
      />

      <Controls
        status={state?.status || "idle"}
        onSync={handleSync}
        onFillNext={handleFillNext}
        onRefreshHeidi={handleRefreshHeidi}
        isSyncing={isSyncing}
        isRefreshingHeidi={isRefreshingHeidi}
      />

      <div className="shortcuts-hint">
        <div>⌘⇧F: Build Fill Plan (analyze EMR screen)</div>
        <div>⌘⇧H: Refresh Heidi</div>
        <div>⌘⇧K: Fill Next (linear fill)</div>
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
          {state?.fillPlan && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                Fill Plan ({state.fillPlan.steps.length} steps)
              </div>
              <div
                style={{ fontSize: "10px", color: "#666", marginBottom: "8px" }}
              >
                Current:{" "}
                {state.fillIndex !== undefined ? state.fillIndex + 1 : "N/A"} /{" "}
                {state.fillPlan.steps.length}
              </div>
              {state.fillPlan.steps.slice(0, 10).map((step, idx) => {
                const heidiField = step.heidiFieldId
                  ? heidiFields.find((f) => f.id === step.heidiFieldId)
                  : null;
                const isCurrent = state.fillIndex === idx;
                return (
                  <div
                    key={idx}
                    style={{
                      marginBottom: "4px",
                      padding: "4px 8px",
                      background: "white",
                      borderRadius: "4px",
                      border: isCurrent
                        ? "2px solid #4CAF50"
                        : "1px solid #ddd",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: isCurrent ? "bold" : "normal",
                      }}
                    >
                      {idx + 1}. {step.emrLabel} ({step.emrFieldId})
                      {isCurrent && " ← Current"}
                    </div>
                    {heidiField ? (
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#666",
                          marginTop: "2px",
                        }}
                      >
                        → {heidiField.label}:{" "}
                        {heidiField.value.substring(0, 40)}
                        {heidiField.value.length > 40 ? "..." : ""}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#999",
                          marginTop: "2px",
                        }}
                      >
                        → No match (will skip)
                      </div>
                    )}
                  </div>
                );
              })}
              {state.fillPlan.steps.length > 10 && (
                <div
                  style={{ fontSize: "10px", color: "#666", marginTop: "4px" }}
                >
                  ... and {state.fillPlan.steps.length - 10} more steps
                </div>
              )}
            </div>
          )}

          {state?.emrLayout && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                EMR Layout ({state.emrLayout.fields.length} fields)
              </div>
              <div
                style={{ fontSize: "10px", color: "#666", marginBottom: "8px" }}
              >
                EMR: {state.emrLayout.emrId} • Screen:{" "}
                {state.emrLayout.screenId}
              </div>
              {state.emrLayout.fields.slice(0, 5).map((field, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: "4px",
                    padding: "4px 8px",
                    background: "white",
                    borderRadius: "4px",
                    border:
                      state.currentEmrField?.id === field.id
                        ? "2px solid #4CAF50"
                        : "1px solid #ddd",
                  }}
                >
                  <div
                    style={{
                      fontWeight:
                        state.currentEmrField?.id === field.id
                          ? "bold"
                          : "normal",
                    }}
                  >
                    {field.label} ({field.id})
                    {state.currentEmrField?.id === field.id && " ← Current"}
                  </div>
                  <div style={{ fontSize: "10px", color: "#999" }}>
                    {field.type} • {field.section || "no section"}
                  </div>
                </div>
              ))}
              {state.emrLayout.fields.length > 5 && (
                <div
                  style={{ fontSize: "10px", color: "#666", marginTop: "4px" }}
                >
                  ... and {state.emrLayout.fields.length - 5} more fields
                </div>
              )}
            </div>
          )}

          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
            Heidi Fields ({heidiFields.length})
          </div>
          {heidiFields.length === 0 ? (
            <div style={{ color: "#666" }}>No fields extracted yet</div>
          ) : (
            heidiFields.map((field, idx) => (
              <div
                key={idx}
                style={{
                  marginBottom: "8px",
                  padding: "8px",
                  background: "white",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              >
                <div style={{ fontWeight: "bold", color: "#333" }}>
                  {field.label} ({field.id})
                </div>
                <div
                  style={{ color: "#666", fontSize: "11px", marginTop: "4px" }}
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
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default App;
