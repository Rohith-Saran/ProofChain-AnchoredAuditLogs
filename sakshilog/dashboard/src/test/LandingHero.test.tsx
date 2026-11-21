import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useEffect } from "react";

// Simulates the WebGL hero failing on a machine without WebGL.
vi.mock("@/components/originkit/hero-41", () => ({
  default: () => {
    useEffect(() => {
      throw new Error("WebGL not supported");
    }, []);
    return <div>hero</div>;
  },
}));

import { LandingPage } from "../pages/LandingPage";

describe("Landing page hero", () => {
  it("still renders the rest of the page when the hero fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(await screen.findByText("SakshiLog M4 Presentation Console")).toBeDefined();
    expect(screen.queryByText("hero")).toBeNull();
  });
});
