import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ChatPage from "./ChatPage";

vi.mock("../services/api", () => ({
  chatStream: vi.fn(async (_query: string, onEvent: (e: Record<string, any>) => void) => {
    onEvent({ type: "tool_call", data: { step: 1, tool: "search_hybrid", input: "{}" } });
    onEvent({
      type: "evidence",
      data: {
        tool: "search_hybrid",
        output: JSON.stringify({ results: [{ chunk_id: "doc-c1", snippet: "Aurora builds search tools." }] }),
      },
    });
    onEvent({ type: "delta", data: { text: "The CEO is " } });
    onEvent({ type: "delta", data: { text: "Ava Chen." } });
    onEvent({ type: "done", data: { answer: "The CEO is Ava Chen.", trace: [], tool_calls: 1 } });
  }),
}));

describe("ChatPage", () => {
  test("renders user message, streamed answer, evidence card, and tool trace", async () => {
    render(<ChatPage />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: "Who is the CEO?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("Who is the CEO?")).toBeTruthy();
    expect(await screen.findByText(/The CEO is Ava Chen/i)).toBeTruthy();
    expect(await screen.findByText(/Aurora builds search tools/i)).toBeTruthy();
    expect((await screen.findAllByText(/search_hybrid/i)).length).toBeGreaterThan(0);
  });
});
