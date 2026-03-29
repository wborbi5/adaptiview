/**
 * Dynamic WebGazer Loader
 *
 * WebGazer.js (Brown University) provides browser-based eye tracking
 * via TensorFlow.js face mesh models. It cannot be imported as an
 * ES module with Next.js App Router due to its global side effects,
 * so we load it dynamically via script tag injection.
 *
 * In production, this would be replaced by a native WASM eye tracker
 * or integrated via MediaPipe Face Mesh directly for tighter control.
 */

/** WebGazer exposes an untyped global — the library has no published @types */
declare global {
  interface Window {
    webgazer: WebGazerInstance;
  }
}

interface WebGazerInstance {
  begin: (onFail?: () => void) => Promise<void>;
  resume: () => Promise<void>;
  pause: () => void;
  end: () => void;
  setGazeListener: (cb: (data: { x: number; y: number } | null, timestamp: number) => void) => WebGazerInstance;
  setRegression: (type: string) => WebGazerInstance;
  showVideoPreview: (show: boolean) => WebGazerInstance;
  showPredictionPoints: (show: boolean) => WebGazerInstance;
  showFaceOverlay: (show: boolean) => WebGazerInstance;
  showFaceFeedbackBox: (show: boolean) => WebGazerInstance;
  getVideoElementCanvas: () => HTMLCanvasElement | null;
  recordScreenPosition: (x: number, y: number, eventType: string) => void;
  isReady: () => boolean;
  params: { showVideoPreview: boolean };
}

let loaded = false;
let loadPromise: Promise<void> | null = null;

export function loadWebGazer(): Promise<void> {
  // BUG FIX: Return a proper Error object (not a string) so .catch() handlers receive a consistent type
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR environment'));
  if (loaded) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/lib/webgazer.js';
    script.async = true;
    script.onload = () => {
      loaded = true;
      resolve();
    };
    script.onerror = () => {
      // BUG FIX: Reset loadPromise on failure so callers can retry loading
      loadPromise = null;
      reject(new Error('Failed to load WebGazer from /public/lib/webgazer.js'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function getWebGazer() {
  if (typeof window === 'undefined') return null;
  return window.webgazer ?? null;
}
