/**
 * useViewport — manages all viewport state for ChromaStudio.
 *
 * Coordinate systems
 * ──────────────────
 *   Document space : intrinsic pixel grid of the open document (origin = top-left of document).
 *   Screen space   : CSS pixels inside the viewport container element (origin = top-left of container).
 *
 * Transformation: screen_pt = doc_pt × zoom + pan
 *
 * This hook owns zoom + pan only.  Document / image data lives in the App layer.
 */

import { useReducer, useCallback, useRef, useEffect } from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────

const MIN_ZOOM = 0.05;   // 5%
const MAX_ZOOM = 32.0;   // 3200%

const ZOOM_STEPS = [
  0.05, 0.0625, 0.083, 0.10, 0.125, 0.167,
  0.25, 0.333, 0.50, 0.667, 0.75,
  1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0,
  12.0, 16.0, 24.0, 32.0,
];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function nextStep(zoom, direction) {
  if (direction > 0) {
    return ZOOM_STEPS.find(s => s > zoom + 1e-9) ?? MAX_ZOOM;
  }
  return [...ZOOM_STEPS].reverse().find(s => s < zoom - 1e-9) ?? MIN_ZOOM;
}

// ─── Reducer ────────────────────────────────────────────────────────────────

const INITIAL = { zoom: 1.0, panX: 0, panY: 0 };

function reducer(state, action) {
  switch (action.type) {

    /**
     * Zoom around a fixed screen point, keeping the document point under
     * that screen coordinate stationary.
     *
     * payload: { newZoom, sx, sy }
     *   sx / sy – screen-space anchor (relative to container top-left)
     */
    case 'ZOOM_AROUND': {
      const z = clamp(action.newZoom, MIN_ZOOM, MAX_ZOOM);
      // doc point that was under (sx, sy) before the zoom:
      const docX = (action.sx - state.panX) / state.zoom;
      const docY = (action.sy - state.panY) / state.zoom;
      // pan so the same doc point stays under (sx, sy) after zoom:
      return {
        zoom: z,
        panX: action.sx - docX * z,
        panY: action.sy - docY * z,
      };
    }

    /**
     * Set exact zoom, keeping a given screen point fixed (defaults to centre
     * of the container if not provided).
     *
     * payload: { newZoom, sx?, sy? }
     */
    case 'SET_ZOOM': {
      const z = clamp(action.newZoom, MIN_ZOOM, MAX_ZOOM);
      const sx = action.sx ?? action.containerW / 2;
      const sy = action.sy ?? action.containerH / 2;
      const docX = (sx - state.panX) / state.zoom;
      const docY = (sy - state.panY) / state.zoom;
      return {
        zoom: z,
        panX: sx - docX * z,
        panY: sy - docY * z,
      };
    }

    /**
     * Fit the document inside the container with a margin.
     *
     * payload: { containerW, containerH, docW, docH }
     */
    case 'FIT': {
      const { containerW, containerH, docW, docH } = action;
      const MARGIN = 40;
      const fitZ = clamp(
        Math.min((containerW - MARGIN * 2) / docW, (containerH - MARGIN * 2) / docH),
        MIN_ZOOM,
        MAX_ZOOM
      );
      return {
        zoom: fitZ,
        panX: (containerW - docW * fitZ) / 2,
        panY: (containerH - docH * fitZ) / 2,
      };
    }

    /**
     * Pan by a delta.
     * payload: { dx, dy }
     */
    case 'PAN_BY':
      return { ...state, panX: state.panX + action.dx, panY: state.panY + action.dy };

    /**
     * Adjust pan when the container resizes, so the document appears to stay
     * centred relative to its previous position.
     *
     * payload: { dw, dh }   (change in container size)
     */
    case 'CONTAINER_RESIZED':
      return {
        ...state,
        panX: state.panX + action.dw / 2,
        panY: state.panY + action.dh / 2,
      };

    default:
      return state;
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * @param {React.RefObject<HTMLElement>} containerRef
 * @param {{ width: number, height: number } | null} docSize  – document dimensions
 */
export function useViewport(containerRef, docSize) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const containerSize = useRef({ w: 0, h: 0 });
  // Keep a ref so wheel handler always reads the latest state without stale closures.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // ─── Resize observer ──────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        const prev = containerSize.current;
        const dw = prev.w ? width  - prev.w : 0;
        const dh = prev.h ? height - prev.h : 0;
        containerSize.current = { w: width, h: height };
        if (dw !== 0 || dh !== 0) {
          dispatch({ type: 'CONTAINER_RESIZED', dw, dh });
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  // ─── Public actions ───────────────────────────────────────────────────────

  const stepZoom = useCallback((direction) => {
    const { w, h } = containerSize.current;
    const { zoom } = stateRef.current;
    dispatch({
      type: 'SET_ZOOM',
      newZoom: nextStep(zoom, direction),
      containerW: w,
      containerH: h,
    });
  }, []);

  const setZoomPercent = useCallback((pct) => {
    const { w, h } = containerSize.current;
    dispatch({
      type: 'SET_ZOOM',
      newZoom: pct / 100,
      containerW: w,
      containerH: h,
    });
  }, []);

  const fitToScreen = useCallback(() => {
    const { w, h } = containerSize.current;
    if (!docSize || !w || !h) return;
    dispatch({
      type: 'FIT',
      containerW: w, containerH: h,
      docW: docSize.width, docH: docSize.height,
    });
  }, [docSize]);

  const actualSize = useCallback(() => {
    const { w, h } = containerSize.current;
    dispatch({ type: 'SET_ZOOM', newZoom: 1.0, containerW: w, containerH: h });
  }, []);

  const panBy = useCallback((dx, dy) => {
    dispatch({ type: 'PAN_BY', dx, dy });
  }, []);

  /**
   * Attach this to a non-passive 'wheel' event on the container element.
   * Expects a pre-computed containerRect (getBoundingClientRect) for performance.
   */
  const handleWheel = useCallback((e, containerRect) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();

    const sx = e.clientX - containerRect.left;
    const sy = e.clientY - containerRect.top;
    const { zoom } = stateRef.current;
    const pixelDelta = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY;
    const factor = Math.pow(1.001, -pixelDelta);
    const newZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);

    dispatch({ type: 'ZOOM_AROUND', newZoom, sx, sy });
  }, []);

  return {
    zoom:        state.zoom,
    panX:        state.panX,
    panY:        state.panY,
    zoomPercent: Math.round(state.zoom * 100),
    stepZoom,
    setZoomPercent,
    fitToScreen,
    actualSize,
    panBy,
    handleWheel,
  };
}
