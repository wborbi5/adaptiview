/**
 * Area of Interest (AOI) Manager
 *
 * Performs real-time hit testing of gaze fixation coordinates against
 * rectangular AOI regions (dashboard sections). Accumulates per-section
 * dwell time used for intervention triggers and style feedback.
 */

export interface AOI {
  id: string;
  label: string;
  rect: DOMRect | { left: number; top: number; width: number; height: number };
}

export interface AOIDwellRecord {
  aoiId: string;
  dwellMs: number;
  fixationCount: number;
}

export class AOIManager {
  private dwellMap: Map<string, { ms: number; count: number }> = new Map();

  constructor(private aois: AOI[]) {
    aois.forEach(a => this.dwellMap.set(a.id, { ms: 0, count: 0 }));
  }

  // BUG FIX: Update AOI rects in place (e.g. after scroll/resize) without resetting
  // accumulated dwell data — avoids the bug where creating a new AOIManager wipes history
  updateRects(newAois: AOI[]) {
    for (const newAoi of newAois) {
      const existing = this.aois.find(a => a.id === newAoi.id);
      if (existing) {
        existing.rect = newAoi.rect;
      }
    }
  }

  // BUG FIX: Expose hit-test so callers can determine which AOI a fixation landed in
  // without relying on the cumulative dwell totals (which would give the wrong AOI for entropy)
  hitTest(fx: number, fy: number): string | null {
    for (const aoi of this.aois) {
      const r = aoi.rect;
      if (fx >= r.left && fx <= r.left + r.width &&
          fy >= r.top  && fy <= r.top  + r.height) {
        return aoi.id;
      }
    }
    return null;
  }

  // Call this for each confirmed fixation
  recordFixation(fx: number, fy: number, durationMs: number) {
    for (const aoi of this.aois) {
      const r = aoi.rect;
      if (fx >= r.left && fx <= r.left + r.width &&
          fy >= r.top  && fy <= r.top  + r.height) {
        const current = this.dwellMap.get(aoi.id)!;
        this.dwellMap.set(aoi.id, {
          ms: current.ms + durationMs,
          count: current.count + 1,
        });
        break; // AOIs are mutually exclusive in this tester
      }
    }
  }

  getResults(): AOIDwellRecord[] {
    return Array.from(this.dwellMap.entries()).map(([aoiId, v]) => ({
      aoiId,
      dwellMs: v.ms,
      fixationCount: v.count,
    }));
  }

  getDwellPercentages(): Record<string, number> {
    const total = Array.from(this.dwellMap.values()).reduce((s, v) => s + v.ms, 0);
    if (total === 0) return {};
    const result: Record<string, number> = {};
    this.dwellMap.forEach((v, id) => { result[id] = v.ms / total; });
    return result;
  }

  reset() {
    this.dwellMap.forEach((_, id) => this.dwellMap.set(id, { ms: 0, count: 0 }));
  }
}
