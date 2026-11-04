import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Capture = (event: string, properties?: Record<string, unknown>) => void;

// The module keeps its queue in module scope, so each test loads a fresh copy.
async function load() {
  vi.resetModules();
  return import("./posthog.js");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("captureEvent", () => {
  it("does nothing without a window", async () => {
    const { captureEvent } = await load();
    expect(() => captureEvent("mpp.test")).not.toThrow();
  });

  it("sends straight to PostHog when it is loaded", async () => {
    const capture = vi.fn<Capture>();
    vi.stubGlobal("window", { posthog: { capture } });
    const { captureEvent } = await load();

    captureEvent("mpp.test", { plan: "pro" });

    expect(capture.mock.calls).toEqual([
      ["mpp.test", { plan: "pro", timestamp: 1767225600000 }],
    ]);
  });

  it("queues events until PostHog loads, then flushes them in order", async () => {
    const win: { posthog?: { capture: Capture } } = {};
    vi.stubGlobal("window", win);
    const { captureEvent } = await load();

    captureEvent("mpp.first");
    captureEvent("mpp.second", { step: 2 });

    const capture = vi.fn<Capture>();
    win.posthog = { capture };
    await vi.advanceTimersByTimeAsync(100);

    expect(capture.mock.calls).toEqual([
      ["mpp.first", { timestamp: 1767225600000 }],
      ["mpp.second", { step: 2, timestamp: 1767225600000 }],
    ]);
  });

  it("drops queued events after 50 retries", async () => {
    const win: { posthog?: { capture: Capture } } = {};
    vi.stubGlobal("window", win);
    const { captureEvent } = await load();

    captureEvent("mpp.lost");
    await vi.advanceTimersByTimeAsync(50 * 100);

    // The queue restarts for the next event, without the dropped one.
    captureEvent("mpp.next");
    const capture = vi.fn<Capture>();
    win.posthog = { capture };
    await vi.advanceTimersByTimeAsync(100);

    expect(capture.mock.calls).toEqual([
      ["mpp.next", { timestamp: 1767225605000 }],
    ]);
  });
});
