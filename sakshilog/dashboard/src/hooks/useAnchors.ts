import { useStore } from "../store/useStore";

export function useAnchors() {
  const batches = useStore((s) => s.batches);
  const fetchBatches = useStore((s) => s.fetchBatches);
  const selectedBatchId = useStore((s) => s.selectedBatchId);
  const setSelectedBatchId = useStore((s) => s.setSelectedBatchId);

  return {
    batches,
    fetchBatches,
    selectedBatchId,
    setSelectedBatchId,
  };
}
