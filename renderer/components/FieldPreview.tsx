import React from 'react';
import './FieldPreview.css';

interface FieldPreviewProps {
  currentField: {
    id: string;
    label: string;
    value: string;
  } | null;
  nextField: {
    id: string;
    label: string;
    value: string;
  } | null;
  currentIndex: number;
  totalFields: number;
}

function FieldPreview({ currentField, nextField, currentIndex, totalFields }: FieldPreviewProps) {
  return (
    <div className="field-preview">
      <div className="current-field">
        <div className="field-label">
          Current Field ({currentIndex + 1} of {totalFields})
        </div>
        {currentField ? (
          <>
            <div className="field-name">{currentField.label}</div>
            <div className="field-value">
              {currentField.value.length > 100
                ? currentField.value.substring(0, 100) + "..."
                : currentField.value}
            </div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
              ID: {currentField.id}
            </div>
          </>
        ) : (
          <div className="field-placeholder">
            {totalFields === 0 
              ? "No Heidi fields available. Press Ctrl+Shift+C to capture Heidi."
              : "No field selected"}
          </div>
        )}
      </div>

      {nextField ? (
        <div className="next-field">
          <div className="field-label">Next Field</div>
          <div className="field-name">{nextField.label}</div>
          <div className="field-value-preview">
            {nextField.value.length > 50
              ? nextField.value.substring(0, 50) + "..."
              : nextField.value}
          </div>
        </div>
      ) : (
        <div className="next-field">
          <div className="field-label">Next Field</div>
          <div className="field-placeholder">
            {totalFields === 0 
              ? "No more fields"
              : "End of fields"}
          </div>
        </div>
      )}
    </div>
  );
}

export default FieldPreview;
