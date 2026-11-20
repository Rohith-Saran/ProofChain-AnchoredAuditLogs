import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";
import { ATTACKS } from "../mock/data";

export function useDemoShortcuts() {
  const navigate = useNavigate();
  const nextStep = useStore((s) => s.nextStep);
  const prevStep = useStore((s) => s.prevStep);
  const resetDemo = useStore((s) => s.resetDemo);
  const runVerification = useStore((s) => s.runVerification);
  const toggleMockMode = useStore((s) => s.toggleMockMode);
  const setSelectedAttack = useStore((s) => s.setSelectedAttack);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if typing inside input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const key = e.key.toUpperCase();

      // Number keys 1-8: jump to attack n
      if (e.key >= "1" && e.key <= "8") {
        const attackIndex = parseInt(e.key, 10) - 1;
        if (ATTACKS[attackIndex]) {
          setSelectedAttack(ATTACKS[attackIndex]);
          navigate(`/attacks/${e.key}`);
        }
        return;
      }

      if (key === "N" || e.key === "ArrowRight") {
        e.preventDefault();
        nextStep();
      } else if (key === "P" || e.key === "ArrowLeft") {
        e.preventDefault();
        prevStep();
      } else if (key === "R") {
        e.preventDefault();
        resetDemo();
      } else if (key === "V") {
        e.preventDefault();
        runVerification();
      } else if (key === "M") {
        e.preventDefault();
        toggleMockMode();
      } else if (e.key === " ") {
        // Space advances step
        e.preventDefault();
        nextStep();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, nextStep, prevStep, resetDemo, runVerification, toggleMockMode, setSelectedAttack]);
}
