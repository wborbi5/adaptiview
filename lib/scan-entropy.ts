/**
 * Gaze Transition Entropy (GTE) — Shannon entropy of AOI visit sequence.
 * Discriminates Visualizer (low entropy, focused scan) from Spatial
 * (high entropy, systematic exploration). Based on Holmqvist et al. (2011).
 */

export function computeScanEntropy(visitSequence: string[]): number {
  if (visitSequence.length === 0) return 0;
  const counts = new Map<string, number>();
  visitSequence.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
  const total = visitSequence.length;
  let entropy = 0;
  counts.forEach(count => {
    const p = count / total;
    entropy -= p * Math.log2(p);
  });
  // Normalize to [0, 1] by dividing by log2(numUniqueAOIs)
  const maxEntropy = Math.log2(counts.size || 1);
  return maxEntropy === 0 ? 0 : entropy / maxEntropy;
}

// ─── Gaze Transition Entropy (Krejtz & Duchowski 2017) ───
// First-order Markov: captures sequential scanning patterns, not just AOI frequencies.
// Strictly more informative than basic scan entropy.

export function computeGazeTransitionEntropy(sequence: string[]): number {
  if (sequence.length < 2) return 0;

  // Build transition counts: from -> to -> count
  const transitions = new Map<string, Map<string, number>>();
  for (let i = 0; i < sequence.length - 1; i++) {
    const from = sequence[i], to = sequence[i + 1];
    if (!transitions.has(from)) transitions.set(from, new Map());
    const row = transitions.get(from)!;
    row.set(to, (row.get(to) || 0) + 1);
  }

  // Compute conditional entropy H(next | current)
  let gte = 0;
  let totalTransitions = 0;
  transitions.forEach((row) => {
    const rowTotal = Array.from(row.values()).reduce((a, b) => a + b, 0);
    totalTransitions += rowTotal;
    let rowEntropy = 0;
    row.forEach(count => {
      const p = count / rowTotal;
      rowEntropy -= p * Math.log2(p);
    });
    gte += rowTotal * rowEntropy;
  });

  if (totalTransitions === 0) return 0;
  gte /= totalTransitions;

  // Normalize by max possible (log2 of number of unique AOIs)
  const maxH = Math.log2(transitions.size || 1);
  return maxH === 0 ? 0 : gte / maxH;
}
