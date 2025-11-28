import React from "react";
import "./FieldPreview.css";

interface Field {
  id: string;
  label: string;
  value: string;
}

interface FieldPreviewProps {
  fields: Field[];
  currentIndex: number;
  onDemoCardClick?: (
    fieldId: string,
    label: string,
    getValue: (overview: any) => string | null
  ) => Promise<void>;
  isLoadingDemo?: boolean;
  demoError?: string | null;
}

function FieldPreview({
  fields,
  currentIndex,
  onDemoCardClick,
  isLoadingDemo = false,
  demoError = null,
}: FieldPreviewProps) {
  if (fields.length === 0) {
    return (
      <div className="field-preview">
        <div className="field-placeholder">
          <div>No session fields available. Press ⌥C to capture screen.</div>
        </div>
        {onDemoCardClick && (
          <>
            <div className="field-placeholder-demo-id">
              <div>Demo Heidi session id:</div>
              <div>337851254565527952685384877024185083869</div>
            </div>
            {demoError && (
              <div className="demo-heidi-error">
                Could not load demo session from Heidi: {demoError}
              </div>
            )}
            <div className="demo-grid">
              <div
                className={`demo-card ${isLoadingDemo ? "disabled" : ""}`}
                onClick={() =>
                  onDemoCardClick(
                    "heidi-demo-session-name",
                    "Session name",
                    (overview) => overview.session_name || null
                  )
                }
              >
                <div className="demo-card-label">Session name</div>
                {isLoadingDemo && (
                  <div className="demo-card-loading">Loading...</div>
                )}
              </div>
              <div
                className={`demo-card ${isLoadingDemo ? "disabled" : ""}`}
                onClick={() =>
                  onDemoCardClick(
                    "heidi-demo-session-gist",
                    "Session gist",
                    (overview) => overview.session_gist || null
                  )
                }
              >
                <div className="demo-card-label">Session gist</div>
                {isLoadingDemo && (
                  <div className="demo-card-loading">Loading...</div>
                )}
              </div>
              <div
                className={`demo-card ${isLoadingDemo ? "disabled" : ""}`}
                onClick={() =>
                  onDemoCardClick(
                    "heidi-demo-consult-note-heading",
                    "Consult note heading",
                    (overview) => overview.consult_note?.heading || null
                  )
                }
              >
                <div className="demo-card-label">Consult note heading</div>
                {isLoadingDemo && (
                  <div className="demo-card-loading">Loading...</div>
                )}
              </div>
              <div
                className={`demo-card ${isLoadingDemo ? "disabled" : ""}`}
                onClick={() =>
                  onDemoCardClick(
                    "heidi-demo-consult-note-summary",
                    "Consult note summary",
                    (overview) => {
                      const result = overview.consult_note?.result;
                      if (!result) return null;
                      return result.length > 300
                        ? result.substring(0, 300) + "..."
                        : result;
                    }
                  )
                }
              >
                <div className="demo-card-label">Consult note summary</div>
                {isLoadingDemo && (
                  <div className="demo-card-loading">Loading...</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="field-preview">
      {fields.map((field, index) => {
        const isCurrent = index === currentIndex;
        return (
          <div
            key={field.id || index}
            className={`field-item ${isCurrent ? "current" : ""}`}
          >
            <div className="field-label">
              {index + 1}. {field.label}
            </div>
            <div className="field-value">
              {field.value.length > 100
                ? field.value.substring(0, 100) + "..."
                : field.value}
            </div>
            <div className="field-id">ID: {field.id}</div>
          </div>
        );
      })}
    </div>
  );
}

export default FieldPreview;
