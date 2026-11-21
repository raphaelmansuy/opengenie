import { describe, expect, it } from "vitest";
import type { Turn } from "./events";
import { contextMeterState, formatCompactTokens } from "./contextmeter";

const mkTurn = (input: number, cached = 0, status: Turn["status"] = "completed"): Turn => ({
  id: `t_${input}`,
  index: 1,
  prompt: "p",
  model: "m",
  status,
  thought: "",
  answer: "ok",
  tools: [],
  evidence: [],
  auditPasses: 0,
  usage: { input, output: 100, cached },
});

describe("contextMeterState", () => {
  it("handles missing or zero contextWindow without NaN (E08)", () => {
    const s = contextMeterState({ usage: { contextUsedTokens: 1000, contextWindow: 0 }, turns: [], hasSession: true });
    expect(s.percent).toBeNull();
    expect(s.tone).toBe("unknown");
    expect(s.cacheHitRate).toBeNull();
  });

  it("computes healthy / elevated / critical pressure thresholds and cache hit-rate", () => {
    const healthy = contextMeterState({
      usage: { contextUsedTokens: 40_000, contextWindow: 128_000, costUsd: 0.0123, costStatus: "known" },
      turns: [mkTurn(10_000, 6_500)],
      hasSession: true,
    });
    expect(healthy.tone).toBe("healthy");
    expect(healthy.percent).toBe(31);
    expect(healthy.cacheHitRate).toBe(65);
    expect(healthy.costLabel).toBe("$0.0123");
    expect(healthy.suggestCompact).toBe(false);
    expect(healthy.canCompact).toBe(true);

    const elevated = contextMeterState({
      usage: { contextUsedTokens: 96_000, contextWindow: 128_000 },
      turns: [mkTurn(10_000, 0)],
      hasSession: true,
    });
    expect(elevated.tone).toBe("elevated");
    expect(elevated.suggestCompact).toBe(true);

    const critical = contextMeterState({
      usage: { contextUsedTokens: 120_000, contextWindow: 128_000 },
      turns: [mkTurn(10_000, 0)],
      hasSession: true,
      running: true,
    });
    expect(critical.tone).toBe("critical");
    // Disabled while running (E06)
    expect(critical.canCompact).toBe(false);
  });

  it("formats compact token numbers cleanly", () => {
    expect(formatCompactTokens(0)).toBe("0");
    expect(formatCompactTokens(850)).toBe("850");
    expect(formatCompactTokens(43_500)).toBe("43.5k");
    expect(formatCompactTokens(1_500_000)).toBe("1.5M");
  });
});
