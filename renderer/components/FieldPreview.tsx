import React from 'react';
import './FieldPreview.css';

interface FieldPreviewProps {
  currentField: { id: string; label: string; value: string } | null;
  nextField: { id: string; label: string; value: string } | null;
}

function FieldPreview({ currentField, nextField }: FieldPreviewProps) {
  return (
    <div className="field-preview">
      <div className="current-field">
        <div className="field-label">Current Field</div>
        {currentField ? (
          <>
            <div className="field-name">{currentField.label}</div>
            <div className="field-value">{currentField.value}</div>
          </>
        ) : (
          <div className="field-placeholder">No field selected</div>
        )}
      </div>

      {nextField && (
        <div className="next-field">
          <div className="field-label">Next Field</div>
          <div className="field-name">{nextField.label}</div>
          <div className="field-value-preview">{nextField.value}</div>
        </div>
      )}

      {!nextField && currentField && (
        <div className="next-field">
          <div className="field-label">Next Field</div>
          <div className="field-placeholder">No more fields</div>
        </div>
      )}
    </div>
  );
}

export default FieldPreview;

