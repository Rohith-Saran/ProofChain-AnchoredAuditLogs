import { useStore } from "../store/useStore";

export function useLogs() {
  const logs = useStore((s) => s.logs);
  const fetchLogs = useStore((s) => s.fetchLogs);
  const selectedLogSeq = useStore((s) => s.selectedLogSeq);
  const setSelectedLogSeq = useStore((s) => s.setSelectedLogSeq);

  return {
    logs,
    fetchLogs,
    selectedLogSeq,
    setSelectedLogSeq,
  };
}
