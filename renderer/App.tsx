import React, { useEffect, useState } from "react";
import "./App.css";
import Controls from "./components/Controls";
import FieldPreview from "./components/FieldPreview";
import "./electron.d";
// Demo fields - in a real app, this would come from an API or config
const demoFields = [
  {
    id: "patientName",
    label: "Patient Name",
    value: "John Smith",
  },
  {
    id: "dob",
    label: "Date of Birth",
    value: "01/01/1980",
  },
  {
    id: "medicareId",
    label: "Medicare / ID",
    value: "2525305501970924",
  },
  {
    id: "reason",
    label: "Reason for Visit",
    value: "Follow-up for hypertension",
  },
  {
    id: "notes",
    label: "Clinical Notes",
    value:
      "Patient reports improved BP control. Continue current medication regimen.",
  },
];

interface AgentState {
  currentIndex: number;
  status: "idle" | "running" | "completed";
  currentField: { id: string; label: string; value: string } | null;
  nextField: { id: string; label: string; value: string } | null;
  totalFields: number;
}

function App() {
  const [state, setState] = useState<AgentState>({
    currentIndex: 0,
    status: "idle",
    currentField: null,
    nextField: null,
    totalFields: demoFields.length,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize fields in main process
    window.electronAPI.agent.setFields(demoFields);

    // Get initial state
    window.electronAPI.agent.getState().then(setState);

    // Listen for state updates
    window.electronAPI.agent.onStateUpdated(setState);

    return () => {
      // Cleanup if needed
    };
  }, []);

  const handleStart = async () => {
    await window.electronAPI.agent.start();
    const newState = await window.electronAPI.agent.getState();
    setState(newState);
  };

  const handleNext = async () => {
    try {
      const result = await window.electronAPI.agent.next();
      if (!result.success && result.error) {
        setError(result.error);
        setTimeout(() => setError(null), 5000);
      } else {
        setError(null);
      }
      const newState = await window.electronAPI.agent.getState();
      setState(newState);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleReset = async () => {
    await window.electronAPI.agent.reset();
    const newState = await window.electronAPI.agent.getState();
    setState(newState);
  };

  return (
    <div className="app">
      <div className="app-header">
        <h1>EMR Helper Agent</h1>
        <div className="status-badge" data-status={state.status}>
          {state.status === "idle" && "Ready"}
          {state.status === "running" && "Running"}
          {state.status === "completed" && "Completed"}
        </div>
      </div>

      <div className="progress-indicator">
        Field {state.currentIndex + 1} of {state.totalFields}
      </div>

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
        currentField={state.currentField}
        nextField={state.nextField}
      />

      <Controls
        status={state.status}
        onStart={handleStart}
        onNext={handleNext}
        onReset={handleReset}
      />

      <div className="shortcuts-hint">
        <div>⌘⇧S: Start</div>
        <div>Tab: Next Field</div>
      </div>
    </div>
  );
}

export default App;
