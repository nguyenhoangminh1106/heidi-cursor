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
  const [showHeidiApiPanel, setShowHeidiApiPanel] = useState(false);
  const [heidiApiStatus, setHeidiApiStatus] = useState<string>("");
  const [heidiApiResult, setHeidiApiResult] = useState<any>(null);
  const [heidiSessionId, setHeidiSessionId] = useState<string>("");
  const [linkedEmrWindow, setLinkedEmrWindow] = useState<
    LinkedWindow | undefined
  >();
  const [demoOverview, setDemoOverview] = useState<any | null>(null);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const DEMO_SESSION_ID = "337851254565527952685384877024185083869";

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

  // Helper to fetch demo overview from Heidi API
  const ensureDemoOverview = async (): Promise<any | null> => {
    if (demoOverview) {
      return demoOverview;
    }

    if (isLoadingDemo) {
      return null;
    }

    setIsLoadingDemo(true);
    setDemoError(null);

    try {
      const result = await window.electronAPI.heidi.getSessionOverview(
        DEMO_SESSION_ID
      );
      console.log(
        "[APP] getSessionOverview result:",
        JSON.stringify(result, null, 2)
      );

      if (result.ok && result.data) {
        // The API response structure could be:
        // Option 1: { ok: true, data: { session: {...} } }
        // Option 2: { ok: true, data: { session_id: "...", session_name: "...", ... } }
        // Option 3: { ok: true, data: {...} } where data is the session directly
        let sessionData = result.data;

        // If data has a 'session' property, use that
        if (sessionData.session) {
          sessionData = sessionData.session;
        }

        console.log("[APP] Extracted session data:", sessionData);
        console.log("[APP] Session data keys:", Object.keys(sessionData));
        console.log("[APP] session_name:", sessionData.session_name);
        console.log("[APP] session_gist:", sessionData.session_gist);
        console.log("[APP] consult_note:", sessionData.consult_note);

        setDemoOverview(sessionData);
        setIsLoadingDemo(false);
        return sessionData;
      } else {
        const errorMsg = result.error || "Failed to load demo session";
        console.error("[APP] Failed to load demo session:", errorMsg);
        setDemoError(errorMsg);
        setIsLoadingDemo(false);
        return null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setDemoError(errorMessage);
      setIsLoadingDemo(false);
      return null;
    }
  };

  // Handler for demo card clicks
  const handleDemoCardClick = async (
    fieldId: string,
    label: string,
    getValue: (overview: any) => string | null
  ) => {
    const overview = await ensureDemoOverview();
    if (!overview) {
      console.error("[APP] No overview available for demo card click");
      return;
    }

    console.log("[APP] Demo card clicked:", label, "Overview:", overview);
    const value = getValue(overview);
    console.log("[APP] Extracted value:", value);

    if (!value) {
      console.warn("[APP] No value extracted for", label);
      return;
    }

    const field = {
      id: fieldId,
      label: label,
      value: value,
      source: "heidi" as const,
    };

    console.log("[APP] Adding field:", field);
    const result = await window.electronAPI.agent.addSessionFields([field]);
    console.log("[APP] Add session fields result:", result);

    if (!result.success && result.error) {
      setDemoError(result.error);
    }
  };

  return (
    <div className="app">
      <div className="app-header">
        <h1>
          Heidi Cursor
          {linkedEmrWindow && (
            <>
              {" "}
              <span className="header-separator">&lt;&gt;</span>{" "}
              <span className="header-linked-name">
                {linkedEmrWindow.windowTitle.length > 30
                  ? linkedEmrWindow.windowTitle.substring(0, 30) + "..."
                  : linkedEmrWindow.windowTitle}
              </span>
            </>
          )}
        </h1>
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

      <FieldPreview
        fields={sessionFields}
        currentIndex={currentFieldIndex}
        onDemoCardClick={
          sessionFields.length === 0 ? handleDemoCardClick : undefined
        }
        isLoadingDemo={isLoadingDemo}
        demoError={demoError}
      />

      <Controls
        status={state?.status || "idle"}
        onCaptureAndEnrich={handleCaptureAndEnrich}
        onClearSession={handleClearSession}
        isCapturing={isCapturing}
        hasSession={sessionFields.length > 0}
      />

      <div className="shortcuts-hint">
        <div className="shortcuts-title">Keyboard Shortcuts</div>
        <div className="shortcuts-grid">
          <div>⌥Y: Toggle view</div>
          <div>⌥C: Capture & enrich</div>
          <div>⌥W: Move up</div>
          <div>⌥S: Move down</div>
          <div>⌥V: Type field</div>
          <div>⌥X: Clear</div>
          <div>⌥D: Disconnect EMR & close</div>
        </div>
        <button
          className={`btn-debug ${
            sessionFields.length === 0 ? "disabled" : ""
          }`}
          onClick={() => {
            if (sessionFields.length > 0) {
              setShowDebugPanel(!showDebugPanel);
            }
          }}
          disabled={sessionFields.length === 0}
        >
          {showDebugPanel ? "Hide" : "Show"} Debug
        </button>
        {process.env.NODE_ENV === "development" && (
          <button
            className="btn-debug"
            onClick={() => {
              setShowHeidiApiPanel(!showHeidiApiPanel);
            }}
          >
            {showHeidiApiPanel ? "Hide" : "Show"} Heidi API
          </button>
        )}
      </div>

      {showDebugPanel && sessionFields.length > 0 && (
        <div className="debug-panel">
          <div className="debug-panel-title">
            Session Fields ({sessionFields.length})
          </div>
          {sessionFields.length === 0 ? (
            <div className="debug-panel-empty">
              No fields captured yet. Press ⌥C to capture screen.
            </div>
          ) : (
            sessionFields.map((field, idx) => {
              const isCurrent = idx === currentFieldIndex;
              return (
                <div
                  key={field.id || idx}
                  className={`debug-field-card ${isCurrent ? "current" : ""}`}
                >
                  <div
                    className={`debug-field-label ${
                      isCurrent ? "current" : ""
                    }`}
                  >
                    {idx + 1}. {field.label} ({field.id})
                    {isCurrent && " ← Current"}
                  </div>
                  <div className="debug-field-value">
                    {field.value.length > 100
                      ? field.value.substring(0, 100) + "..."
                      : field.value}
                  </div>
                  {field.source && (
                    <div className="debug-field-source">
                      Source: {field.source}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {process.env.NODE_ENV === "development" && showHeidiApiPanel && (
        <div className="heidi-api-panel">
          <div className="heidi-api-title">Heidi API Testing (Dev Only)</div>

          {/* EMR → Heidi Patient Profile */}
          <div style={{ marginBottom: "16px" }}>
            <div className="heidi-api-section-title">
              EMR → Heidi Patient Profile
            </div>
            <button
              onClick={async () => {
                setHeidiApiStatus("Syncing patient profile...");
                setHeidiApiResult(null);
                try {
                  const result =
                    await window.electronAPI.heidi.createPatientProfileFromEmr();
                  setHeidiApiResult(result);
                  if (result.ok) {
                    setHeidiApiStatus("✓ Patient profile synced successfully");
                    console.log("Patient profile:", result.data);
                  } else {
                    setHeidiApiStatus(`✗ Error: ${result.error}`);
                  }
                } catch (err) {
                  const errorMessage =
                    err instanceof Error ? err.message : "Unknown error";
                  setHeidiApiStatus(`✗ Error: ${errorMessage}`);
                  console.error("Error syncing patient profile:", err);
                }
              }}
              className="heidi-api-button heidi-api-button-primary"
            >
              Sync Patient to Heidi
            </button>
          </div>

          {/* Heidi → EMR Session Data */}
          <div style={{ marginBottom: "16px" }}>
            <div className="heidi-api-section-title">
              Heidi → EMR Session Data
            </div>
            <div style={{ marginBottom: "8px" }}>
              <input
                type="text"
                placeholder="Session ID"
                value={heidiSessionId}
                onChange={(e) => setHeidiSessionId(e.target.value)}
                className="heidi-api-input"
              />
            </div>
            <div className="heidi-api-button-group">
              <button
                onClick={async () => {
                  if (!heidiSessionId.trim()) {
                    setHeidiApiStatus("Please enter a session ID");
                    return;
                  }
                  setHeidiApiStatus("Fetching overview...");
                  setHeidiApiResult(null);
                  try {
                    const result =
                      await window.electronAPI.heidi.getSessionOverview(
                        heidiSessionId
                      );
                    setHeidiApiResult(result);
                    if (result.ok) {
                      setHeidiApiStatus("✓ Overview fetched");
                      console.log("Overview:", result.data);
                    } else {
                      setHeidiApiStatus(`✗ Error: ${result.error}`);
                    }
                  } catch (err) {
                    const errorMessage =
                      err instanceof Error ? err.message : "Unknown error";
                    setHeidiApiStatus(`✗ Error: ${errorMessage}`);
                  }
                }}
                className="heidi-api-button"
              >
                Fetch Overview
              </button>
              <button
                onClick={async () => {
                  if (!heidiSessionId.trim()) {
                    setHeidiApiStatus("Please enter a session ID");
                    return;
                  }
                  setHeidiApiStatus("Fetching context...");
                  setHeidiApiResult(null);
                  try {
                    const result =
                      await window.electronAPI.heidi.getSessionContext(
                        heidiSessionId
                      );
                    setHeidiApiResult(result);
                    if (result.ok) {
                      setHeidiApiStatus("✓ Context fetched");
                      console.log("Context:", result.data);
                    } else {
                      setHeidiApiStatus(`✗ Error: ${result.error}`);
                    }
                  } catch (err) {
                    const errorMessage =
                      err instanceof Error ? err.message : "Unknown error";
                    setHeidiApiStatus(`✗ Error: ${errorMessage}`);
                  }
                }}
                className="heidi-api-button"
              >
                Fetch Context
              </button>
              <button
                onClick={async () => {
                  if (!heidiSessionId.trim()) {
                    setHeidiApiStatus("Please enter a session ID");
                    return;
                  }
                  setHeidiApiStatus("Fetching transcription...");
                  setHeidiApiResult(null);
                  try {
                    const result =
                      await window.electronAPI.heidi.getSessionTranscription(
                        heidiSessionId
                      );
                    setHeidiApiResult(result);
                    if (result.ok) {
                      setHeidiApiStatus("✓ Transcription fetched");
                      console.log("Transcription:", result.data);
                    } else {
                      setHeidiApiStatus(`✗ Error: ${result.error}`);
                    }
                  } catch (err) {
                    const errorMessage =
                      err instanceof Error ? err.message : "Unknown error";
                    setHeidiApiStatus(`✗ Error: ${errorMessage}`);
                  }
                }}
                className="heidi-api-button"
              >
                Fetch Transcription
              </button>
              <button
                onClick={async () => {
                  if (!heidiSessionId.trim()) {
                    setHeidiApiStatus("Please enter a session ID");
                    return;
                  }
                  setHeidiApiStatus("Fetching consult notes...");
                  setHeidiApiResult(null);
                  try {
                    const result =
                      await window.electronAPI.heidi.getSessionConsultNotes(
                        heidiSessionId
                      );
                    setHeidiApiResult(result);
                    if (result.ok) {
                      setHeidiApiStatus("✓ Consult notes fetched");
                      console.log("Consult notes:", result.data);
                    } else {
                      setHeidiApiStatus(`✗ Error: ${result.error}`);
                    }
                  } catch (err) {
                    const errorMessage =
                      err instanceof Error ? err.message : "Unknown error";
                    setHeidiApiStatus(`✗ Error: ${errorMessage}`);
                  }
                }}
                className="heidi-api-button"
              >
                Fetch Consult Notes
              </button>
              <button
                onClick={async () => {
                  if (!heidiSessionId.trim()) {
                    setHeidiApiStatus("Please enter a session ID");
                    return;
                  }
                  setHeidiApiStatus("Fetching coding...");
                  setHeidiApiResult(null);
                  try {
                    const result =
                      await window.electronAPI.heidi.getSessionCoding(
                        heidiSessionId
                      );
                    setHeidiApiResult(result);
                    if (result.ok) {
                      setHeidiApiStatus("✓ Coding fetched");
                      console.log("Coding:", result.data);
                    } else {
                      setHeidiApiStatus(`✗ Error: ${result.error}`);
                    }
                  } catch (err) {
                    const errorMessage =
                      err instanceof Error ? err.message : "Unknown error";
                    setHeidiApiStatus(`✗ Error: ${errorMessage}`);
                  }
                }}
                className="heidi-api-button"
              >
                Fetch Coding
              </button>
              <button
                onClick={async () => {
                  if (!heidiSessionId.trim()) {
                    setHeidiApiStatus("Please enter a session ID");
                    return;
                  }
                  setHeidiApiStatus("Fetching session...");
                  setHeidiApiResult(null);
                  try {
                    const result = await window.electronAPI.heidi.getSession(
                      heidiSessionId
                    );
                    setHeidiApiResult(result);
                    if (result.ok) {
                      setHeidiApiStatus("✓ Session fetched");
                      console.log("Session:", result.data);
                    } else {
                      setHeidiApiStatus(`✗ Error: ${result.error}`);
                    }
                  } catch (err) {
                    const errorMessage =
                      err instanceof Error ? err.message : "Unknown error";
                    setHeidiApiStatus(`✗ Error: ${errorMessage}`);
                  }
                }}
                className="heidi-api-button"
              >
                Get Session
              </button>
              <button
                onClick={async () => {
                  if (!heidiSessionId.trim()) {
                    setHeidiApiStatus("Please enter a session ID");
                    return;
                  }
                  setHeidiApiStatus("Fetching documents...");
                  setHeidiApiResult(null);
                  try {
                    const result =
                      await window.electronAPI.heidi.getSessionDocuments(
                        heidiSessionId
                      );
                    setHeidiApiResult(result);
                    if (result.ok) {
                      setHeidiApiStatus("✓ Documents fetched");
                      console.log("Documents:", result.data);
                    } else {
                      setHeidiApiStatus(`✗ Error: ${result.error}`);
                    }
                  } catch (err) {
                    const errorMessage =
                      err instanceof Error ? err.message : "Unknown error";
                    setHeidiApiStatus(`✗ Error: ${errorMessage}`);
                  }
                }}
                className="heidi-api-button"
              >
                Get Documents
              </button>
            </div>
          </div>

          {/* Status and Result Display */}
          {heidiApiStatus && (
            <div
              className={`heidi-api-status ${
                heidiApiStatus.startsWith("✓")
                  ? "success"
                  : heidiApiStatus.startsWith("✗")
                  ? "error"
                  : "info"
              }`}
            >
              {heidiApiStatus}
            </div>
          )}

          {heidiApiResult && (
            <div style={{ marginTop: "8px" }}>
              <button
                onClick={() => setHeidiApiResult(null)}
                className="heidi-api-result-clear"
              >
                Clear Result
              </button>
              <pre className="heidi-api-result-pre">
                {JSON.stringify(heidiApiResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
