'use client';

import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface GazePoint {
  x: number;
  y: number;
  t: number;
}

export interface GazeHeatmapHandle {
  addPoint: (x: number, y: number, t: number) => void;
  clear: () => void;
  getPoints: () => GazePoint[];
}

interface Props {
  visible?: boolean;
  opacity?: number;
  containerRef?: React.RefObject<HTMLElement | null>;
}

/* ─── Heatmap color mapping ──────────────────────────────────────────────── */

const RADIUS = 55;
const INTENSITY = 0.06;

function intensityToColor(val: number): [number, number, number, number] {
  const v = Math.min(1, Math.max(0, val));
  let r = 0, g = 0, b = 0;
  if (v < 0.2) {
    const t = v / 0.2;
    r = 30; g = Math.round(80 + t * 120); b = Math.round(200 + t * 55);
  } else if (v < 0.45) {
    const t = (v - 0.2) / 0.25;
    r = 0; g = Math.round(200 + t * 55); b = Math.round(255 * (1 - t));
  } else if (v < 0.7) {
    const t = (v - 0.45) / 0.25;
    r = Math.round(t * 255); g = 255; b = 0;
  } else {
    const t = (v - 0.7) / 0.3;
    r = 255; g = Math.round(200 * (1 - t)); b = 0;
  }
  const alpha = Math.min(200, Math.round(v * 280));
  return [r, g, b, alpha];
}

/* ─── Cached gaussian brush (larger, softer) ─────────────────────────────── */

let _brushCache: HTMLCanvasElement | null = null;
let _brushRadius = 0;

function getGaussianBrush(radius: number): HTMLCanvasElement {
  if (_brushCache && _brushRadius === radius) return _brushCache;
  const size = radius * 2;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.25, 'rgba(0,0,0,0.7)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  _brushCache = c;
  _brushRadius = radius;
  return c;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

const GazeHeatmap = forwardRef<GazeHeatmapHandle, Props>(function GazeHeatmap(
  { visible = true, opacity = 0.6, containerRef },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<GazePoint[]>([]);
  const [, setTick] = useState(0);
  const dirtyRef = useRef(false);

  const addPoint = useCallback((x: number, y: number, t: number) => {
    // Convert viewport coordinates to container-relative (accounts for scroll)
    let px = x, py = y;
    if (containerRef?.current) {
      const el = containerRef.current;
      const rect = el.getBoundingClientRect();
      px = x - rect.left + el.scrollLeft;
      py = y - rect.top + el.scrollTop;
    }
    pointsRef.current.push({ x: px, y: py, t });
    dirtyRef.current = true;
  }, [containerRef]);

  const clear = useCallback(() => {
    pointsRef.current = [];
    dirtyRef.current = true;
  }, []);

  const getPoints = useCallback(() => pointsRef.current, []);

  const renderHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = containerRef?.current;
    const W = container ? container.scrollWidth : window.innerWidth;
    const H = container ? container.scrollHeight : window.innerHeight;

    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    const points = pointsRef.current;
    if (points.length === 0) return;

    // Accumulate intensity in offscreen grayscale canvas
    const offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = H;
    const offCtx = offscreen.getContext('2d')!;
    offCtx.globalCompositeOperation = 'lighter';

    const brush = getGaussianBrush(RADIUS);
    for (const pt of points) {
      offCtx.globalAlpha = INTENSITY;
      offCtx.drawImage(brush, pt.x - RADIUS, pt.y - RADIUS);
    }

    // Colorize
    const intensityData = offCtx.getImageData(0, 0, W, H);
    const colorData = ctx.createImageData(W, H);

    for (let i = 0; i < intensityData.data.length; i += 4) {
      const intensity = intensityData.data[i + 3] / 255;
      if (intensity < 0.008) continue;
      const [r, g, b, a] = intensityToColor(intensity);
      colorData.data[i] = r;
      colorData.data[i + 1] = g;
      colorData.data[i + 2] = b;
      colorData.data[i + 3] = a;
    }

    ctx.putImageData(colorData, 0, 0);
  }, [containerRef]);

  // Render at ~5fps when dirty
  useEffect(() => {
    const interval = setInterval(() => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        renderHeatmap();
        setTick(t => t + 1);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [renderHeatmap]);

  useImperativeHandle(ref, () => ({
    addPoint,
    clear,
    getPoints,
  }), [addPoint, clear, getPoints]);

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity,
        zIndex: 50,
        mixBlendMode: 'screen',
      }}
    />
  );
});

export default GazeHeatmap;
