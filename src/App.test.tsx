import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
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
});
