/**
 * Unified Gaze Hook — WebGazer Integration
 *
 * Provides real-time eye tracking via WebGazer.js with EMA smoothing,
 * diagnostic telemetry, and camera stream management. No mouse fallback —
 * eye tracking is the core innovation.
 *
 * All gaze data is processed locally in the browser. No video frames
 * or gaze coordinates are transmitted to any server.
 */

import { useEffect, useRef, useState } from 'react';
import { loadWebGazer, getWebGazer } from './webgazer-loader';
import type { GazeSample } from './ivt-fixation';

export interface GazeDiagnostics {
  scriptLoaded: boolean;
  webgazerObject: boolean;
  cameraStream: boolean;
  faceMeshReady: boolean;
  gazeListenerSet: boolean;
  totalNulls: number;
  totalValid: number;
  lastError: string | null;
}

interface UseGazeOptions {
  onSample: (sample: GazeSample) => void;
}

export function useGaze({ onSample }: UseGazeOptions) {
  const [mode, setMode] = useState<'loading' | 'webgazer' | 'error'>('loading');
  const [diagnostics, setDiagnostics] = useState<GazeDiagnostics>({
    scriptLoaded: false,
    webgazerObject: false,
    cameraStream: false,
    faceMeshReady: false,
    gazeListenerSet: false,
    totalNulls: 0,
    totalValid: 0,
    lastError: null,
  });

  const activeRef = useRef(true);
  const onSampleRef = useRef(onSample);
  useEffect(() => { onSampleRef.current = onSample; }, [onSample]);

  const diagRef = useRef(diagnostics);
  const updateDiag = (patch: Partial<GazeDiagnostics>) => {
    diagRef.current = { ...diagRef.current, ...patch };
    setDiagnostics({ ...diagRef.current });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    activeRef.current = true;
    let nullCount = 0;
    let validCount = 0;

    // Periodic diagnostic update (avoid re-render on every frame)
    const diagInterval = setInterval(() => {
      if (!activeRef.current) return;
      if (nullCount !== diagRef.current.totalNulls || validCount !== diagRef.current.totalValid) {
        updateDiag({ totalNulls: nullCount, totalValid: validCount });
      }
    }, 1000);

    loadWebGazer().then(() => {
      if (!activeRef.current) return;
      updateDiag({ scriptLoaded: true });

      const wg = getWebGazer();
      if (!wg) {
        updateDiag({ lastError: 'window.webgazer is null after script load' });
        setMode('error');
        return;
      }
      updateDiag({ webgazerObject: true });

      // Check for camera stream periodically
      const streamCheck = setInterval(() => {
        if (!activeRef.current) { clearInterval(streamCheck); return; }
        const videoEl = document.getElementById('webgazerVideoFeed') as HTMLVideoElement | null;
        if (videoEl && videoEl.srcObject) {
          updateDiag({ cameraStream: true });
          clearInterval(streamCheck);
        }
        // Also check if face overlay canvas has content (face mesh working)
        const faceCanvas = document.getElementById('webgazerFaceOverlay') as HTMLCanvasElement | null;
        if (faceCanvas && faceCanvas.width > 0) {
          updateDiag({ faceMeshReady: true });
        }
      }, 500);
      // Stop checking after 30s
      setTimeout(() => clearInterval(streamCheck), 30000);

      // EMA smoothing state — reduces WebGazer jitter while staying responsive
      const EMA_ALPHA = 0.6; // higher = more responsive; 0.6 balances smoothing vs lag
      let smoothX = -1;
      let smoothY = -1;

      wg.setGazeListener((data: { x: number; y: number } | null, timestamp: number) => {
        if (!activeRef.current) return;
        if (!data) {
          nullCount++;
          return;
        }
        // Valid gaze data
        validCount++;
        if (validCount === 1) {
          updateDiag({ totalValid: 1 });
          smoothX = data.x;
          smoothY = data.y;
        } else {
          // Exponential moving average
          smoothX = EMA_ALPHA * data.x + (1 - EMA_ALPHA) * smoothX;
          smoothY = EMA_ALPHA * data.y + (1 - EMA_ALPHA) * smoothY;
        }
        setMode('webgazer');
        onSampleRef.current({ x: smoothX, y: smoothY, t: timestamp });
      });
      updateDiag({ gazeListenerSet: true });

      // Start or resume WebGazer
      const onCameraFail = () => {
        console.error('[AdaptiView] Camera stream failed');
        updateDiag({ lastError: 'Camera stream failed — permission denied or no webcam' });
        setMode('error');
      };

      try {
        if (wg.isReady && wg.isReady()) {
          wg.resume();
          updateDiag({ cameraStream: true });
        } else {
          wg.begin(onCameraFail);
        }
      } catch (err) {
        console.error('[AdaptiView] begin/resume threw:', err);
        updateDiag({ lastError: `begin/resume error: ${err}` });
        try { wg.begin(onCameraFail); } catch (err2) {
          updateDiag({ lastError: `double begin error: ${err2}` });
          setMode('error');
        }
      }
    }).catch((err) => {
      console.error('[AdaptiView] Script load failed:', err);
      updateDiag({ lastError: `Script load failed: ${err}` });
      setMode('error');
    });

    return () => {
      activeRef.current = false;
      clearInterval(diagInterval);
      const wg = getWebGazer();
      if (wg) {
        try {
          wg.showPredictionPoints(false);
          wg.pause();
        } catch {}
      }
    };
  }, []);

  return { mode, diagnostics };
}
