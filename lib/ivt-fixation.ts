/**
 * I-VT (Velocity-Threshold Identification) Fixation Detector
 *
 * Implements the Salvucci & Goldberg (2000) algorithm for classifying
 * raw gaze samples into fixations and saccades based on angular velocity.
 * Fixations feed into dwell accumulation; saccade amplitudes contribute
 * to the cognitive style feature vector.
 */

export interface GazeSample {
  x: number;
  y: number;
  t: number; // timestamp ms
}

export interface Fixation {
  x: number;
  y: number;
  duration: number;
  startTime: number;
}

const PIXEL_VELOCITY_THRESHOLD = 0.45; // px/ms — empirically tuned for WebGazer
const MIN_FIXATION_DURATION = 150; // ms

export function detectFixations(samples: GazeSample[]): Fixation[] {
  if (samples.length < 2) return [];
  const fixations: Fixation[] = [];
  let fixationBuffer: GazeSample[] = [samples[0]];

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const dt = curr.t - prev.t;
    if (dt <= 0) continue;

    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const velocity = Math.sqrt(dx * dx + dy * dy) / dt;

    if (velocity <= PIXEL_VELOCITY_THRESHOLD) {
      fixationBuffer.push(curr);
    } else {
      if (fixationBuffer.length >= 2) {
        const duration = fixationBuffer[fixationBuffer.length - 1].t - fixationBuffer[0].t;
        if (duration >= MIN_FIXATION_DURATION) {
          const avgX = fixationBuffer.reduce((s, p) => s + p.x, 0) / fixationBuffer.length;
          const avgY = fixationBuffer.reduce((s, p) => s + p.y, 0) / fixationBuffer.length;
          fixations.push({ x: avgX, y: avgY, duration, startTime: fixationBuffer[0].t });
        }
      }
      fixationBuffer = [curr];
    }
  }

  // BUG FIX: Flush remaining buffer at end of samples array
  if (fixationBuffer.length >= 2) {
    const duration = fixationBuffer[fixationBuffer.length - 1].t - fixationBuffer[0].t;
    if (duration >= MIN_FIXATION_DURATION) {
      const avgX = fixationBuffer.reduce((s, p) => s + p.x, 0) / fixationBuffer.length;
      const avgY = fixationBuffer.reduce((s, p) => s + p.y, 0) / fixationBuffer.length;
      fixations.push({ x: avgX, y: avgY, duration, startTime: fixationBuffer[0].t });
    }
  }

  return fixations;
}

// ─── Saccade extraction ───

export interface Saccade {
  amplitude: number; // pixels between fixation centroids
  duration: number;  // ms gap between fixations
}

export function extractSaccades(fixations: Fixation[]): Saccade[] {
  const saccades: Saccade[] = [];
  for (let i = 1; i < fixations.length; i++) {
    const prev = fixations[i - 1];
    const curr = fixations[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    saccades.push({
      amplitude: Math.sqrt(dx * dx + dy * dy),
      duration: curr.startTime - (prev.startTime + prev.duration),
    });
  }
  return saccades;
}

// ─── Coefficient K (Krejtz et al. 2016) ───
// Positive K = focal processing (long fixations, short saccades)
// Negative K = ambient processing (short fixations, long saccades)

export function computeCoefficientK(fixations: Fixation[], saccades: Saccade[]): number {
  const n = Math.min(fixations.length, saccades.length);
  if (n < 3) return 0;

  const durations = fixations.slice(0, n).map(f => f.duration);
  const amplitudes = saccades.slice(0, n).map(s => s.amplitude);

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr: number[], m: number) =>
    Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);

  const mD = mean(durations), sD = std(durations, mD);
  const mA = mean(amplitudes), sA = std(amplitudes, mA);

  if (sD === 0 || sA === 0) return 0;

  const kValues = durations.map((d, i) =>
    (d - mD) / sD - (amplitudes[i] - mA) / sA
  );

  return mean(kValues);
}
