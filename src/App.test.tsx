import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the recipe atlas index", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "The Essential Home-Cook Atlas" })).toBeInTheDocument();
    expect(screen.getByText("Showing 262 recipe cards")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mapo Tofu/i })).toBeInTheDocument();
  });

  it("renders a recipe detail route", () => {
    render(
      <MemoryRouter initialEntries={["/recipe/mapo-tofu"]}>
        <App />
      </MemoryRouter>,
    );

    const heading = screen.getByRole("heading", { name: "Mapo Tofu" });
    const image = screen.getByRole("img", { name: "Mapo Tofu recipe card" });
    const assetName = screen.getByText("mapo-tofu.webp");

    expect(heading).toBeInTheDocument();
    expect(assetName).toBeInTheDocument();
    expect(heading.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(image.compareDocumentPosition(assetName) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("jumps to the top when changing routes", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: /Mapo Tofu/i }));

    expect(screen.getByRole("heading", { name: "Mapo Tofu" })).toBeInTheDocument();
    expect(window.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0, behavior: "auto" });
  });
});
