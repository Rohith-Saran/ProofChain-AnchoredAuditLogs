import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Stepper } from "../components/Stepper";

describe("Stepper component", () => {
  it("renders caption and step dots correctly", () => {
    const onStepChange = vi.fn();
    render(
      <Stepper
        currentStep={1}
        totalSteps={4}
        onStepChange={onStepChange}
        caption="Step 2 of the attack"
      />
    );

    expect(screen.getByText("Step 2 of the attack")).toBeDefined();
    expect(screen.getByText("Prev")).toBeDefined();
    expect(screen.getByText("Next")).toBeDefined();

    const dots = screen.getAllByRole("tab");
    expect(dots.length).toBe(4);
    expect(dots[1].getAttribute("aria-selected")).toBe("true");
  });

  it("handles next and prev clicks", () => {
    const onStepChange = vi.fn();
    render(
      <Stepper
        currentStep={1}
        totalSteps={3}
        onStepChange={onStepChange}
      />
    );

    const nextBtn = screen.getByText("Next");
    fireEvent.click(nextBtn);
    expect(onStepChange).toHaveBeenCalledWith(2);

    const prevBtn = screen.getByText("Prev");
    fireEvent.click(prevBtn);
    expect(onStepChange).toHaveBeenCalledWith(0);
  });
});
