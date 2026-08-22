import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GraphExplorer from "./GraphExplorer";

vi.mock("../services/api", () => ({
  fetchGraph: vi.fn(async () => ({
    entity: null,
    depth: 1,
    nodes: [
      { id: "Ava Chen", label: "Ava Chen", type: "PERSON", description: "CEO" },
      { id: "Aurora", label: "Aurora", type: "ORGANIZATION", description: "Company" },
    ],
    edges: [{ id: "e1", source: "Ava Chen", target: "Aurora", label: "leads", weight: 1 }],
  })),
}));

describe("GraphExplorer", () => {
  test("renders the search box and graph node labels", async () => {
    render(<GraphExplorer />);
    expect(screen.getByPlaceholderText(/entity name/i)).toBeTruthy();
    expect(await screen.findByText("Ava Chen")).toBeTruthy();
    expect(await screen.findByText("Aurora")).toBeTruthy();
  });
});
