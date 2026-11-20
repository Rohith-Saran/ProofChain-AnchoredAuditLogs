import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerdictBadge } from "../components/VerdictBadge";

describe("VerdictBadge component", () => {
  it("renders OK badge with proper accessibility label", () => {
    render(<VerdictBadge verdict="OK" />);
    const badge = screen.getByLabelText("OK: Matches the chain");
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain("OK");
  });

  it("renders MODIFIED badge with description", () => {
    render(<VerdictBadge verdict="MODIFIED" />);
    const badge = screen.getByLabelText("MODIFIED: Line was edited");
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain("MODIFIED");
  });

  it("renders ANCHOR_SILENCE badge", () => {
    render(<VerdictBadge verdict="ANCHOR_SILENCE" />);
    const badge = screen.getByLabelText("ANCHOR_SILENCE: Agent went silent");
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain("ANCHOR_SILENCE");
  });
});
