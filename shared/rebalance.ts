/**
 * Pure helper that distributes engineers across pods as evenly as possible.
 *
 * Inputs:
 * - engineers: list of { id, active } sorted by id ascending (caller's responsibility).
 * - podCount: 1, 2, or 3.
 * - gapHoursPerPod (optional): if provided, pods with more gap-hours receive the
 *   "leftover" engineer first when the count doesn't divide evenly. e.g. with
 *   16 engineers / 3 pods the split is 6/5/5; the pod with the highest current
 *   gap density gets the 6.
 *
 * Output:
 * - Map<engineerId, podNumber> — only includes the *active* engineers; inactive
 *   engineers retain their existing pod (caller decides whether to clear them).
 */
export interface RebalanceInput {
  id: number;
  active: boolean;
}

export function rebalancePods(
  engineers: RebalanceInput[],
  podCount: 1 | 2 | 3,
  gapHoursPerPod?: Record<number, number>,
): Map<number, number> {
  const active = engineers.filter((e) => e.active).sort((a, b) => a.id - b.id);
  const out = new Map<number, number>();
  if (active.length === 0) return out;

  const base = Math.floor(active.length / podCount);
  const remainder = active.length % podCount;

  // Order pods so the ones with the highest current gap-hours pick first when there's a remainder.
  const podOrder = Array.from({ length: podCount }, (_, i) => i + 1).sort((a, b) => {
    const ag = gapHoursPerPod?.[a] ?? 0;
    const bg = gapHoursPerPod?.[b] ?? 0;
    if (bg !== ag) return bg - ag; // descending gap
    return a - b; // stable by pod number
  });

  // Assign sizes: first `remainder` pods (in podOrder) get base+1, rest get base.
  const sizeByPod = new Map<number, number>();
  podOrder.forEach((p, idx) => {
    sizeByPod.set(p, base + (idx < remainder ? 1 : 0));
  });

  // Walk active engineers and slot them into pods 1..podCount in numeric order
  // (so visually, pod 1 contains the lowest-id engineers, pod 2 the next, etc.).
  let cursor = 0;
  for (let p = 1; p <= podCount; p++) {
    const size = sizeByPod.get(p) ?? 0;
    for (let i = 0; i < size; i++) {
      const eng = active[cursor++];
      if (!eng) break;
      out.set(eng.id, p);
    }
  }
  return out;
}
