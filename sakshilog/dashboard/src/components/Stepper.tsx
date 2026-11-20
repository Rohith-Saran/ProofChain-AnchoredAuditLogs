import React, { useEffect, useCallback } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "./Icons";

export interface StepperProps {
  currentStep: number;
  totalSteps: number;
  onStepChange: (index: number) => void;
  caption?: string;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  currentStep,
  totalSteps,
  onStepChange,
  caption,
  className = "",
}) => {
  const canPrev = currentStep > 0;
  const canNext = currentStep < totalSteps - 1;

  const handlePrev = useCallback(() => {
    if (canPrev) onStepChange(currentStep - 1);
  }, [canPrev, currentStep, onStepChange]);

  const handleNext = useCallback(() => {
    if (canNext) onStepChange(currentStep + 1);
  }, [canNext, currentStep, onStepChange]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        handleNext();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrev, handleNext]);

  return (
    <div
      className={`stepper-container ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
        width: "100%",
        padding: "16px 0",
      }}
    >
      {caption && (
        <div
          className="stepper-caption"
          style={{
            fontSize: "1.05rem",
            color: "var(--ink)",
            textAlign: "center",
            maxWidth: "760px",
            lineHeight: 1.45,
            fontWeight: 500,
            padding: "8px 16px",
            background: "var(--surface)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--line)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
          aria-live="polite"
        >
          {caption}
        </div>
      )}

      <div
        className="stepper-controls"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <button
          type="button"
          onClick={handlePrev}
          disabled={!canPrev}
          aria-label="Previous step"
          className="stepper-btn stepper-btn-prev"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--line)",
            background: canPrev ? "var(--surface)" : "transparent",
            color: canPrev ? "var(--ink)" : "var(--ink-muted)",
            opacity: canPrev ? 1 : 0.4,
            cursor: canPrev ? "pointer" : "not-allowed",
            fontWeight: 600,
            transition: "all 0.15s ease",
          }}
        >
          <ArrowLeftIcon size={16} />
          <span>Prev</span>
        </button>

        <div
          className="stepper-dots"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
          role="tablist"
          aria-label="Step progress"
        >
          {Array.from({ length: totalSteps }).map((_, idx) => {
            const isActive = idx === currentStep;
            return (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`Step ${idx + 1} of ${totalSteps}`}
                onClick={() => onStepChange(idx)}
                style={{
                  width: isActive ? "24px" : "10px",
                  height: "10px",
                  borderRadius: "5px",
                  border: "none",
                  background: isActive ? "var(--chain)" : "var(--line)",
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                  padding: 0,
                }}
              />
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleNext}
          disabled={!canNext}
          aria-label="Next step"
          className="stepper-btn stepper-btn-next"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--line)",
            background: canNext ? "var(--chain)" : "transparent",
            color: canNext ? "#ffffff" : "var(--ink-muted)",
            opacity: canNext ? 1 : 0.4,
            cursor: canNext ? "pointer" : "not-allowed",
            fontWeight: 600,
            transition: "all 0.15s ease",
          }}
        >
          <span>Next</span>
          <ArrowRightIcon size={16} />
        </button>
      </div>
    </div>
  );
};
