import { useStore } from "../store/useStore";

export function useVerdicts() {
  const verification = useStore((s) => s.verification);
  const isVerifying = useStore((s) => s.isVerifying);
  const runVerification = useStore((s) => s.runVerification);
  const isAnchorSilent = useStore((s) => s.isAnchorSilent);

  return {
    verification,
    isVerifying,
    runVerification,
    isAnchorSilent,
  };
}
