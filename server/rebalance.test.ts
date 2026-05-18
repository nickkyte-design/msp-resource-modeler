import { describe, expect, it } from "vitest";
import { rebalancePods } from "../shared/rebalance";
import { computeHeadcountSuggestion } from "../shared/scheduling";

describe("rebalancePods", () => {
  it("evenly distributes 15 engineers across 3 pods (5/5/5)", () => {
    const engineers = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, active: true }));
    const result = rebalancePods(engineers, 3);
    const counts = [1, 2, 3].map(
      (p) => Array.from(result.values()).filter((v) => v === p).length,
    );
    expect(counts).toEqual([5, 5, 5]);
    expect(result.size).toBe(15);
  });

  it("handles uneven splits with 16 engineers across 3 pods (6/5/5)", () => {
    const engineers = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, active: true }));
    const result = rebalancePods(engineers, 3);
    const counts = [1, 2, 3].map(
      (p) => Array.from(result.values()).filter((v) => v === p).length,
    );
    // Sorted descending: one pod gets 6, others 5
    expect(counts.sort((a, b) => b - a)).toEqual([6, 5, 5]);
  });

  it("gives the extra engineer to the pod with the highest gap-hours when uneven", () => {
    const engineers = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, active: true }));
    // pod 2 has the most gaps -> it should receive the +1 engineer.
    const result = rebalancePods(engineers, 3, { 1: 100, 2: 500, 3: 200 });
    const podSizes = new Map<number, number>();
    for (const v of result.values()) podSizes.set(v, (podSizes.get(v) ?? 0) + 1);
    expect(podSizes.get(2)).toBe(6);
    expect(podSizes.get(3)).toBe(5);
    expect(podSizes.get(1)).toBe(5);
  });

  it("ignores inactive engineers", () => {
    const engineers = [
      { id: 1, active: true },
      { id: 2, active: false },
      { id: 3, active: true },
      { id: 4, active: false },
    ];
    const result = rebalancePods(engineers, 2);
    expect(result.size).toBe(2);
    expect(result.has(2)).toBe(false);
    expect(result.has(4)).toBe(false);
  });

  it("returns an empty map when there are no active engineers", () => {
    const result = rebalancePods([{ id: 1, active: false }], 3);
    expect(result.size).toBe(0);
  });

  it("places all engineers in pod 1 when podCount is 1", () => {
    const engineers = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, active: true }));
    const result = rebalancePods(engineers, 1);
    expect(result.size).toBe(7);
    for (const v of result.values()) expect(v).toBe(1);
  });
});

describe("computeHeadcountSuggestion", () => {
  it("returns minimum 5/pod from the cycle math", () => {
    const s = computeHeadcountSuggestion(1, false, false);
    expect(s.minimumPerPod).toBe(5);
    // Even without PTO/holidays we still add the 10% clustering margin and +1 reliever.
    // ceil(5 * 1.10) + 1 = 7
    expect(s.recommendedPerPod).toBe(7);
    expect(s.minimumTotal).toBe(5);
    expect(s.recommendedTotal).toBe(7);
  });

  it("adds a buffer when PTO + holidays are enabled", () => {
    const s = computeHeadcountSuggestion(1, true, true);
    expect(s.minimumPerPod).toBe(5);
    // 5 * (1 + 0.0808 + 0.10) ≈ 5.904 → ceil = 6, plus +1 reliever = 7
    expect(s.recommendedPerPod).toBe(7);
    expect(s.recommendedTotal).toBe(7);
  });

  it("scales totals by pod count", () => {
    const s = computeHeadcountSuggestion(3, true, true);
    expect(s.minimumTotal).toBe(15);
    expect(s.recommendedTotal).toBe(21);
  });

  it("recommendation is always at least minimum + 1 floating reliever", () => {
    for (const pods of [1, 2, 3] as const) {
      const s = computeHeadcountSuggestion(pods, false, false);
      expect(s.recommendedPerPod).toBeGreaterThanOrEqual(s.minimumPerPod + 1);
    }
  });

  it("provides reasoning lines in the suggestion", () => {
    const s = computeHeadcountSuggestion(2, true, false);
    expect(s.reasoning.length).toBeGreaterThanOrEqual(4);
    expect(s.reasoning.join(" ")).toContain("21");
    expect(s.reasoning.join(" ")).toContain("PTO");
    expect(s.reasoning.join(" ")).toContain("clustering");
    expect(s.reasoning.join(" ")).toContain("floating reliever");
  });
});
