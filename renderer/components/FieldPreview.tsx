import React from 'react';
import './FieldPreview.css';
import { AgentFieldMapping, AgentState } from '../../src/types/agent';

interface FieldPreviewProps {
  currentMapping: AgentFieldMapping | null;
  nextMapping: AgentFieldMapping | null;
  agentState?: AgentState;
}

interface FieldPreviewProps {
  currentMapping: AgentFieldMapping | null;
  nextMapping: AgentFieldMapping | null;
  agentState?: AgentState;
  heidiFields?: Array<{
    id: string;
    label: string;
    value: string;
  }>;
}

function FieldPreview({ currentMapping, nextMapping, agentState, heidiFields = [] }: FieldPreviewProps) {
  const fillPlan = agentState?.fillPlan;
  const fillIndex = agentState?.fillIndex ?? -1;

  // Use linear fill plan if available
  if (fillPlan && fillIndex >= 0 && fillIndex < fillPlan.steps.length) {
    const currentStep = fillPlan.steps[fillIndex];
    const nextStep = fillPlan.steps[fillIndex + 1] || null;

    const currentHeidiField = currentStep.heidiFieldId
      ? heidiFields.find((f) => f.id === currentStep.heidiFieldId)
      : null;
    const nextHeidiField = nextStep?.heidiFieldId
      ? heidiFields.find((f) => f.id === nextStep.heidiFieldId)
      : null;

    return (
      <div className="field-preview">
        <div className="current-field">
          <div className="field-label">
            Current Field ({fillIndex + 1} of {fillPlan.steps.length})
          </div>
          <div className="field-name">{currentStep.emrLabel}</div>
          {currentHeidiField ? (
            <>
              <div className="field-value">
                {currentHeidiField.value.length > 100
                  ? currentHeidiField.value.substring(0, 100) + "..."
                  : currentHeidiField.value}
              </div>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                Heidi: {currentHeidiField.label} ({currentHeidiField.id})
              </div>
            </>
          ) : (
            <div className="field-placeholder">No Heidi match (will skip)</div>
          )}
        </div>

        {nextStep && (
          <div className="next-field">
            <div className="field-label">Next Field</div>
            <div className="field-name">{nextStep.emrLabel}</div>
            {nextHeidiField ? (
              <div className="field-value-preview">
                {nextHeidiField.value.length > 50
                  ? nextHeidiField.value.substring(0, 50) + "..."
                  : nextHeidiField.value}
              </div>
            ) : (
              <div className="field-placeholder">No Heidi match (will skip)</div>
            )}
          </div>
        )}

        {!nextStep && (
          <div className="next-field">
            <div className="field-label">Next Field</div>
            <div className="field-placeholder">Fill plan complete</div>
          </div>
        )}
      </div>
    );
  }

  // Fallback to legacy mapping display
  const currentEmrField = agentState?.currentEmrField;
  const emrLayout = agentState?.emrLayout;

  return (
    <div className="field-preview">
      <div className="current-field">
        <div className="field-label">Current Field</div>
        {currentMapping ? (
          <>
            <div className="field-name">
              {currentEmrField ? (
                <>
                  {currentEmrField.label}
                  {currentEmrField.section && (
                    <span style={{ fontSize: '10px', color: '#666', marginLeft: '4px' }}>
                      ({currentEmrField.section})
                    </span>
                  )}
                </>
              ) : (
                currentMapping.emrField.labelText
              )}
            </div>
            {currentMapping.heidiField ? (
              <>
                <div className="field-value">{currentMapping.heidiField.value}</div>
                <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                  Heidi: {currentMapping.heidiField.label} ({currentMapping.heidiField.id})
                </div>
              </>
            ) : (
              <div className="field-placeholder">No Heidi field matched</div>
            )}
          </>
        ) : (
          <div className="field-placeholder">No field selected</div>
        )}
      </div>

      {emrLayout && (
        <div style={{ fontSize: '10px', color: '#666', marginTop: '4px', padding: '4px', background: '#f0f0f0', borderRadius: '4px' }}>
          EMR Layout: {emrLayout.fields.length} fields detected
        </div>
      )}

      {nextMapping && (
        <div className="next-field">
          <div className="field-label">Next Field</div>
          <div className="field-name">{nextMapping.emrField.labelText}</div>
          {nextMapping.heidiField ? (
            <div className="field-value-preview">{nextMapping.heidiField.value}</div>
          ) : (
            <div className="field-placeholder">No Heidi field matched</div>
          )}
        </div>
      )}

      {!nextMapping && currentMapping && (
        <div className="next-field">
          <div className="field-label">Next Field</div>
          <div className="field-placeholder">Will detect on next Tab</div>
        </div>
      )}
    </div>
  );
}

export default FieldPreview;
