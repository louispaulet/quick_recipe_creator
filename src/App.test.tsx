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

    expect(screen.getByRole("heading", { name: "Mapo Tofu" })).toBeInTheDocument();
    expect(screen.getByText("mapo-tofu.webp")).toBeInTheDocument();
  });
});
