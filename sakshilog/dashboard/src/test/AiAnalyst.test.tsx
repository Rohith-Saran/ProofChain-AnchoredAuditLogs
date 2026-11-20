import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { setMockMode } from "../api/client";
import { useStore } from "../store/useStore";
import { AttackTimelinePanel } from "../components/AttackTimelinePanel";
import { CertInReportPanel } from "../components/CertInReportPanel";
import { AskLogsPanel } from "../components/AskLogsPanel";

function resetAi(mock: boolean) {
  setMockMode(mock);
  useStore.setState({
    connectionStatus: mock ? "mock" : "connected",
    attackTimeline: null,
    timelineError: null,
    isLoadingTimeline: false,
    certInReport: null,
    certInError: null,
    isLoadingCertIn: false,
    logAnswers: [],
    askError: null,
    isAsking: false,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AI Analyst panels (mock mode)", () => {
  beforeEach(() => resetAi(true));

  it("renders the attack timeline with MITRE links and a MOCK badge", async () => {
    render(<AttackTimelinePanel onSelectSeq={() => {}} />);
    await screen.findByText("Root shell via sudo");
    expect(screen.getByText("MOCK")).toBeDefined();
    const link = screen.getByText("T1548.003").closest("a");
    expect(link?.getAttribute("href")).toBe("https://attack.mitre.org/techniques/T1548/003/");
    expect(link?.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText(/1 proposed step blocked/)).toBeDefined();
  });

  it("opens the cited entry when a citation chip is clicked", async () => {
    const onSelect = vi.fn();
    render(<AttackTimelinePanel onSelectSeq={onSelect} />);
    fireEvent.click(await screen.findByTitle("Verified entry #103 — click to inspect"));
    expect(onSelect).toHaveBeenCalledWith(103);
  });

  it("renders the CERT-In report fields and the 6-hour countdown", async () => {
    render(<CertInReportPanel onSelectSeq={() => {}} />);
    await screen.findByText("Unauthorised access of IT systems/data");
    expect(screen.getByText("192.168.1.42")).toBeDefined();
    expect(screen.getByText(/left$/)).toBeDefined();
    expect(screen.getByText("incident@cert-in.org.in").getAttribute("href")).toBe("mailto:incident@cert-in.org.in");
  });

  it("answers a question with cited sentences", async () => {
    render(<AskLogsPanel onSelectSeq={() => {}} />);
    fireEvent.change(screen.getByLabelText("Question about the logs"), { target: { value: "Who became root?" } });
    fireEvent.click(screen.getByText("Ask"));
    await screen.findByText("Who became root?");
    expect(await screen.findByTitle("Verified entry #102 — click to inspect")).toBeDefined();
  });
});

describe("AI Analyst panels (live, AI not configured)", () => {
  beforeEach(() => resetAi(false));

  it("shows the honest not-configured message instead of a fabricated report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "no key", code: "not_configured" }), { status: 503 }))
    );
    render(<AttackTimelinePanel onSelectSeq={() => {}} />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/AI is not configured/));
    expect(screen.queryByText("MOCK")).toBeNull();
  });

  it("says the service is down when it can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    render(<CertInReportPanel onSelectSeq={() => {}} />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/isn't running/));
  });
});
