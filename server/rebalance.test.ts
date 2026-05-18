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
    // Without PTO/holidays, recommended equals minimum.
    expect(s.recommendedPerPod).toBe(5);
    expect(s.minimumTotal).toBe(5);
    expect(s.recommendedTotal).toBe(5);
  });

  it("adds a buffer when PTO + holidays are enabled", () => {
    const s = computeHeadcountSuggestion(1, true, true);
    expect(s.minimumPerPod).toBe(5);
    // 5 * (1 + (10 + 11)/52/5) ≈ 5 * 1.0808 ≈ 5.4 → ceil = 6
    expect(s.recommendedPerPod).toBe(6);
    expect(s.recommendedTotal).toBe(6);
  });

  it("scales totals by pod count", () => {
    const s = computeHeadcountSuggestion(3, true, true);
    expect(s.minimumTotal).toBe(15);
    expect(s.recommendedTotal).toBe(18);
  });

  it("provides reasoning lines in the suggestion", () => {
    const s = computeHeadcountSuggestion(2, true, false);
    expect(s.reasoning.length).toBeGreaterThanOrEqual(3);
    expect(s.reasoning.join(" ")).toContain("21");
    expect(s.reasoning.join(" ")).toContain("PTO");
  });
});
