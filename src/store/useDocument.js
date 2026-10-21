/**
 * useDocument — ChromaStudio document state module.
 *
 * Responsible for:
 *   • The ordered layer stack (bottom to top)
 *   • Per-layer pixel data (ImageBitmap), opacity, blend mode, visibility, position
 *   • Compositing all visible layers onto an offscreen canvas
 *   • Thumbnail generation per layer
 *
 * This module is completely independent of viewport zoom / pan.
 * Document pixels are always stored at native resolution.
 *
 * Layer order convention: layers[0] is the BOTTOM layer; layers[layers.length-1] is the TOP.
 * The Layers panel renders them in REVERSED order (top at the top of the panel list).
 */

import { useReducer, useCallback, useRef, useEffect } from 'react';
import { MAX_HISTORY_ENTRIES, captureSnapshot, releaseSnapshot } from './useHistory';
import { applySelectionClip } from '../utils/selectionUtils';
import { renderTextToCanvas, renderShapeToCanvas, makeVectorThumbnail } from '../utils/textShapeRenderer';

// ─── Supported MIME types ────────────────────────────────────────────────────

export const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

export function isSupportedFile(file) {
  if (SUPPORTED_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
}

// ─── ID generator ────────────────────────────────────────────────────────────

let _idCounter = 0;
function newId() { return `layer-${++_idCounter}-${Date.now()}`; }

// ─── Thumbnail helpers ────────────────────────────────────────────────────────

const THUMB_W = 40;
const THUMB_H = 32;

/**
 * Render an ImageBitmap into a small dataURL thumbnail.
 * Returns a data: URL string or null.
 */
export async function makeThumbnail(imageBitmap) {
  if (!imageBitmap) return null;
  const c = document.createElement('canvas');
  c.width  = THUMB_W;
  c.height = THUMB_H;
  const ctx = c.getContext('2d');
  // Draw scaled down, preserve aspect ratio with letter-boxing.
  const scale = Math.min(THUMB_W / imageBitmap.width, THUMB_H / imageBitmap.height);
  const dw = imageBitmap.width  * scale;
  const dh = imageBitmap.height * scale;
  const dx = (THUMB_W - dw) / 2;
  const dy = (THUMB_H - dh) / 2;
  ctx.clearRect(0, 0, THUMB_W, THUMB_H);
  ctx.drawImage(imageBitmap, dx, dy, dw, dh);
  return c.toDataURL('image/png');
}

// ─── Blank (transparent) ImageBitmap factory ─────────────────────────────────

export async function makeBlankBitmap(width, height) {
  const c = document.createElement('canvas');
  c.width  = width;
  c.height = height;
  // Leave it transparent (no fill)
  return createImageBitmap(c);
}

// ─── Layer factory ────────────────────────────────────────────────────────────

/**
 * Create a new layer descriptor.
 * @param {string} name
 * @param {ImageBitmap | null} imageBitmap
 * @param {{ x: number, y: number }} [position]
 * @param {string} [type]  'image' | 'transparent' | 'text' | 'shape' | 'adjustment'
 * @param {object} [extra] Additional properties (textData, shapeData, width, height)
 */
export function createLayer(name, imageBitmap, position = { x: 0, y: 0 }, type = 'image', extra = {}) {
  return {
    id:            newId(),
    name,
    type,                           // 'image' | 'transparent' | 'text' | 'shape'
    imageBitmap,                    // ImageBitmap (real pixel data) – null for vector layers
    previewBitmap: null,            // Non-destructive live preview bitmap
    thumbnail:     null,            // data: URL, filled async
    visible:       true,
    opacity:       100,             // 0–100
    blendMode:     'source-over',   // CSS globalCompositeOperation
    x: position.x,
    y: position.y,
    width:  imageBitmap?.width  ?? extra.width  ?? 0,
    height: imageBitmap?.height ?? extra.height ?? 0,
    // Vector layer data (only for type 'text' / 'shape')
    textData:  extra.textData  ?? null,
    shapeData: extra.shapeData ?? null,
    adjustmentData: extra.adjustmentData ?? null,
    transform: extra.transform ?? { scaleX: 1, scaleY: 1, rotation: 0 },
  };
}

// ─── Document descriptor ──────────────────────────────────────────────────────

function createDocument(width, height, name = 'Untitled') {
  return {
    name,
    width,
    height,
    colorSpace: 'sRGB',
    bitsPerChannel: 8,
  };
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

const INITIAL_STATE = {
  doc:           null,    // { name, width, height, … } or null
  layers:        [],      // ordered bottom-to-top
  activeLayerId: null,
  selection:     null,    // { type: 'rect'|'ellipse', x, y, width, height, inverted }
  history:       [],      // array of history snapshots
  historyIndex:  -1,      // pointer into history array
};

function commitMutation(state, nextDoc, nextLayers, nextActiveLayerId, historyLabel, isCoalescable = false, nextSelection = state.selection) {
  // 1. Drop forward redo history
  const forward = state.history.slice(state.historyIndex + 1);
  for (const s of forward) releaseSnapshot(s);
  const retained = state.history.slice(0, state.historyIndex + 1);

  // 2. Coalescing (e.g. for rapid opacity changes on the same layer)
  const lastSnap = retained[retained.length - 1];
  if (isCoalescable && lastSnap && lastSnap.label === historyLabel && (Date.now() - lastSnap.timestamp < 600)) {
    releaseSnapshot(lastSnap);
    retained[retained.length - 1] = captureSnapshot(nextDoc, nextLayers, nextActiveLayerId, historyLabel, nextSelection);
  } else {
    retained.push(captureSnapshot(nextDoc, nextLayers, nextActiveLayerId, historyLabel, nextSelection));
    if (retained.length > MAX_HISTORY_ENTRIES) {
      const evicted = retained.splice(0, retained.length - MAX_HISTORY_ENTRIES);
      for (const s of evicted) releaseSnapshot(s);
    }
  }

  return {
    doc:           nextDoc,
    layers:        nextLayers,
    activeLayerId: nextActiveLayerId,
    selection:     nextSelection,
    history:       retained,
    historyIndex:  retained.length - 1,
  };
}

function docReducer(state, action) {
  switch (action.type) {

    // ── Open / create a document from an image ──────────────────────────────
    case 'OPEN_IMAGE': {
      const { doc, layer } = action;
      for (const s of state.history) releaseSnapshot(s);
      const snap = captureSnapshot(doc, [layer], layer.id, `Open: ${doc.name}`, null);
      return {
        doc,
        layers: [layer],
        activeLayerId: layer.id,
        selection: null,
        history: [snap],
        historyIndex: 0,
      };
    }

    // ── Update a layer's thumbnail after async generation ───────────────────
    case 'SET_THUMBNAIL': {
      const nextLayers = state.layers.map(l =>
        l.id === action.layerId ? { ...l, thumbnail: action.dataUrl } : l
      );
      const curSnap = state.history[state.historyIndex];
      if (curSnap) {
        curSnap.layers = curSnap.layers.map(l =>
          l.id === action.layerId ? { ...l, thumbnail: action.dataUrl } : l
        );
      }
      return {
        ...state,
        layers: nextLayers,
      };
    }

    // ── Select a layer ───────────────────────────────────────────────────────
    case 'SELECT_LAYER': {
      const curSnap = state.history[state.historyIndex];
      if (curSnap) {
        curSnap.activeLayerId = action.layerId;
      }
      return { ...state, activeLayerId: action.layerId };
    }

    // ── Toggle visibility ────────────────────────────────────────────────────
    case 'TOGGLE_VISIBILITY': {
      const nextLayers = state.layers.map(l =>
        l.id === action.layerId ? { ...l, visible: !l.visible } : l
      );
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, action.historyLabel || 'Toggle Visibility');
    }

    // ── Set opacity (0–100) ──────────────────────────────────────────────────
    case 'SET_OPACITY': {
      const nextLayers = state.layers.map(l =>
        l.id === action.layerId ? { ...l, opacity: action.opacity } : l
      );
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, action.historyLabel || 'Set Opacity', true);
    }

    // ── Set blend mode ────────────────────────────────────────────────────────
    case 'SET_BLEND_MODE': {
      const nextLayers = state.layers.map(l =>
        l.id === action.layerId ? { ...l, blendMode: action.blendMode } : l
      );
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, action.historyLabel || 'Set Blend Mode');
    }

    // ── Rename a layer ────────────────────────────────────────────────────────
    case 'RENAME_LAYER': {
      const nextLayers = state.layers.map(l =>
        l.id === action.layerId ? { ...l, name: action.name } : l
      );
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, action.historyLabel || 'Rename Layer');
    }

    // ── Add a new transparent layer above the active one ─────────────────────
    case 'ADD_LAYER': {
      const { layer } = action;
      const activeIdx = state.layers.findIndex(l => l.id === state.activeLayerId);
      const insertAt = activeIdx >= 0 ? activeIdx + 1 : state.layers.length;
      const nextLayers = [...state.layers];
      nextLayers.splice(insertAt, 0, layer);
      return commitMutation(state, state.doc, nextLayers, layer.id, action.historyLabel || 'New Layer');
    }

    // ── Duplicate the active layer ────────────────────────────────────────────
    case 'DUPLICATE_LAYER': {
      const src = state.layers.find(l => l.id === action.layerId);
      if (!src) return state;
      const copy = {
        ...src,
        id: newId(),
        name: `${src.name} copy`,
        thumbnail: src.thumbnail,
        imageBitmap: src.imageBitmap,
        previewBitmap: null,
      };
      const srcIdx = state.layers.findIndex(l => l.id === action.layerId);
      const nextLayers = [...state.layers];
      nextLayers.splice(srcIdx + 1, 0, copy);
      return commitMutation(state, state.doc, nextLayers, copy.id, action.historyLabel || 'Duplicate Layer');
    }

    // ── Delete a layer ────────────────────────────────────────────────────────
    case 'DELETE_LAYER': {
      if (state.layers.length <= 1) return state;
      const idx    = state.layers.findIndex(l => l.id === action.layerId);
      const nextLayers = state.layers.filter(l => l.id !== action.layerId);
      const newActive = (
        nextLayers[idx]
        ?? nextLayers[idx - 1]
        ?? nextLayers[0]
      );
      return commitMutation(state, state.doc, nextLayers, newActive?.id ?? null, action.historyLabel || 'Delete Layer');
    }

    // ── Reorder layers (move layerId to newIndex in the array) ───────────────
    case 'REORDER_LAYER': {
      const { layerId, newIndex } = action;
      const idx  = state.layers.findIndex(l => l.id === layerId);
      if (idx < 0) return state;
      const nextLayers = [...state.layers];
      const [moved] = nextLayers.splice(idx, 1);
      nextLayers.splice(newIndex, 0, moved);
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, action.historyLabel || 'Reorder Layer');
    }

    // ── Set entire document and layers (crop, image size, canvas size) ───────
    case 'SET_DOCUMENT_AND_LAYERS': {
      return commitMutation(state, action.doc, action.layers, state.activeLayerId, action.historyLabel || 'Document Resize');
    }

    // ── Live filter preview on a layer ────────────────────────────────────────
    case 'SET_LAYER_PREVIEW': {
      const { layerId, previewBitmap } = action;
      return {
        ...state,
        layers: state.layers.map(l =>
          l.id === layerId ? { ...l, previewBitmap } : l
        ),
      };
    }

    case 'CLEAR_LAYER_PREVIEW': {
      const { layerId } = action;
      return {
        ...state,
        layers: state.layers.map(l =>
          l.id === layerId ? { ...l, previewBitmap: null } : l
        ),
      };
    }

    case 'APPLY_LAYER_FILTER': {
      const { layerId, newBitmap, thumbnail, historyLabel } = action;
      const nextLayers = state.layers.map(l =>
        l.id === layerId
          ? { ...l, imageBitmap: newBitmap, thumbnail, previewBitmap: null }
          : l
      );
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, historyLabel || 'Apply Filter');
    }

    // ── Commit painted or erased stroke to a layer ─────────────────────────
    case 'COMMIT_LAYER_STROKE': {
      const { layerId, newBitmap, thumbnail, historyLabel } = action;
      const nextLayers = state.layers.map(l =>
        l.id === layerId
          ? { ...l, imageBitmap: newBitmap, thumbnail, previewBitmap: null }
          : l
      );
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, historyLabel || 'Brush Stroke');
    }

    // ── Selection State Actions ─────────────────────────────────────────────
    case 'SET_SELECTION': {
      return {
        ...state,
        selection: action.selection ? { ...action.selection } : null,
      };
    }

    case 'DESELECT': {
      return {
        ...state,
        selection: null,
      };
    }

    case 'INVERT_SELECTION': {
      if (!state.selection) {
        if (!state.doc) return state;
        return {
          ...state,
          selection: {
            type: 'rect',
            x: 0,
            y: 0,
            width: state.doc.width,
            height: state.doc.height,
            inverted: false,
          },
        };
      }
      return {
        ...state,
        selection: {
          ...state.selection,
          inverted: !state.selection.inverted,
        },
      };
    }

    case 'SELECT_ALL': {
      if (!state.doc) return state;
      return {
        ...state,
        selection: {
          type: 'rect',
          x: 0,
          y: 0,
          width: state.doc.width,
          height: state.doc.height,
          inverted: false,
        },
      };
    }

    case 'CLEAR_SELECTION_PIXELS': {
      const { layerId, newBitmap, thumbnail, historyLabel } = action;
      const nextLayers = state.layers.map(l =>
        l.id === layerId
          ? { ...l, imageBitmap: newBitmap, thumbnail, previewBitmap: null }
          : l
      );
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, historyLabel || 'Clear Selection', false, state.selection);
    }

    // ── Update text layer data ─────────────────────────────────────────────
    case 'UPDATE_TEXT_DATA': {
      const { layerId, textData, historyLabel } = action;
      const nextLayers = state.layers.map(l =>
        l.id === layerId ? { ...l, textData: { ...textData } } : l
      );
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, historyLabel || 'Edit Text');
    }

    // ── Update shape layer data ───────────────────────────────────────────
    case 'UPDATE_SHAPE_DATA': {
      const { layerId, shapeData, historyLabel } = action;
      const nextLayers = state.layers.map(l =>
        l.id === layerId ? { ...l, shapeData: { ...shapeData } } : l
      );
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, historyLabel || 'Edit Shape');
    }
    case 'UPDATE_LAYER_TRANSFORM': {
      const nextLayers = state.layers.map(l => l.id === action.layerId ? { ...l, transform: { ...action.transform } } : l);
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, action.historyLabel || 'Transform Layer');
    }
    case 'UPDATE_ADJUSTMENT_DATA': {
      const nextLayers = state.layers.map(l => l.id === action.layerId ? { ...l, adjustmentData: { ...action.adjustmentData } } : l);
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, action.historyLabel || 'Edit Adjustment');
    }

    case 'MOVE_SELECTION_PIXELS': {
      const { layerId, newBitmap, thumbnail, newSelection, historyLabel } = action;
      const nextLayers = state.layers.map(l =>
        l.id === layerId
          ? { ...l, imageBitmap: newBitmap, thumbnail, previewBitmap: null }
          : l
      );
      return commitMutation(state, state.doc, nextLayers, state.activeLayerId, historyLabel || 'Move Selection', false, newSelection);
    }

    // ── Undo ──────────────────────────────────────────────────────────────────
    case 'UNDO': {
      if (state.historyIndex <= 0) return state;
      const nextIndex = state.historyIndex - 1;
      const snap = state.history[nextIndex];
      return {
        ...state,
        doc:           snap.doc ? { ...snap.doc } : null,
        layers:        snap.layers.map(l => ({ ...l, previewBitmap: null })),
        activeLayerId: snap.activeLayerId,
        selection:     snap.selection ? { ...snap.selection } : null,
        historyIndex:  nextIndex,
      };
    }

    // ── Redo ──────────────────────────────────────────────────────────────────
    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state;
      const nextIndex = state.historyIndex + 1;
      const snap = state.history[nextIndex];
      return {
        ...state,
        doc:           snap.doc ? { ...snap.doc } : null,
        layers:        snap.layers.map(l => ({ ...l, previewBitmap: null })),
        activeLayerId: snap.activeLayerId,
        selection:     snap.selection ? { ...snap.selection } : null,
        historyIndex:  nextIndex,
      };
    }

    // ── Jump to History ───────────────────────────────────────────────────────
    case 'JUMP_TO_HISTORY': {
      const targetIndex = action.index;
      if (targetIndex < 0 || targetIndex >= state.history.length) return state;
      const snap = state.history[targetIndex];
      return {
        ...state,
        doc:           snap.doc ? { ...snap.doc } : null,
        layers:        snap.layers.map(l => ({ ...l, previewBitmap: null })),
        activeLayerId: snap.activeLayerId,
        selection:     snap.selection ? { ...snap.selection } : null,
        historyIndex:  targetIndex,
      };
    }

    // ── Close document ────────────────────────────────────────────────────────
    case 'CLOSE_DOCUMENT': {
      for (const s of state.history) releaseSnapshot(s);
      return INITIAL_STATE;
    }

    // ── Restore a history snapshot (backward compat) ─────────────────────────
    case 'RESTORE_SNAPSHOT': {
      const { snapshot } = action;
      if (!snapshot) return state;
      return {
        ...state,
        doc:           snapshot.doc ? { ...snapshot.doc } : null,
        layers:        snapshot.layers.map(l => ({ ...l, previewBitmap: null })),
        activeLayerId: snapshot.activeLayerId,
      };
    }

    default:
      return state;
  }
}

// ─── Compositing ──────────────────────────────────────────────────────────────

/**
 * Composite all visible layers onto an offscreen canvas and return it.
 * Called whenever the layer stack changes. Runs synchronously on the main thread;
 * the canvas is re-used across calls to avoid GC pressure.
 *
 * @param {HTMLCanvasElement} canvas  – persistent offscreen canvas
 * @param {{ width, height }} doc
 * @param {Array}             layers  – bottom-to-top order
 * @param {string|null}       bgColor – optional background color (e.g. for JPEG)
 */
export function applyAdjustmentPixels(ctx, width, height, data = {}, strength = 1) {
  const image = ctx.getImageData(0, 0, width, height);
  const source = image.data.slice(); const p = image.data;
  const brightness = (data.brightness ?? 0) * 2.55;
  const contrast = 1 + (data.contrast ?? 0) / 100;
  const saturation = 1 + (data.saturation ?? 0) / 100;
  const grayscale = Math.max(0, Math.min(1, data.grayscale ?? 0));
  for (let i = 0; i < p.length; i += 4) {
    let r = (p[i] - 128) * contrast + 128 + brightness;
    let g = (p[i + 1] - 128) * contrast + 128 + brightness;
    let b = (p[i + 2] - 128) * contrast + 128 + brightness;
    const lum = r * .299 + g * .587 + b * .114;
    r = lum + (r - lum) * saturation; g = lum + (g - lum) * saturation; b = lum + (b - lum) * saturation;
    r = r * (1 - grayscale) + lum * grayscale; g = g * (1 - grayscale) + lum * grayscale; b = b * (1 - grayscale) + lum * grayscale;
    p[i] = source[i] * (1 - strength) + Math.max(0, Math.min(255, r)) * strength;
    p[i+1] = source[i+1] * (1 - strength) + Math.max(0, Math.min(255, g)) * strength;
    p[i+2] = source[i+2] * (1 - strength) + Math.max(0, Math.min(255, b)) * strength;
  }
  ctx.putImageData(image, 0, 0);
}

export function compositeToCanvas(canvas, doc, layers, bgColor = null) {
  if (!canvas || !doc) return;
  if (canvas.width !== doc.width || canvas.height !== doc.height) {
    canvas.width  = doc.width;
    canvas.height = doc.height;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, doc.width, doc.height);
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }

  for (const layer of layers) {
    if (!layer.visible) continue;
    if (layer.type === 'adjustment') {
      applyAdjustmentPixels(ctx, doc.width, doc.height, layer.adjustmentData, layer.opacity / 100);
      continue;
    }
    ctx.save();
    ctx.globalAlpha              = layer.opacity / 100;
    ctx.globalCompositeOperation = layer.blendMode;
    const transform = layer.transform ?? { scaleX: 1, scaleY: 1, rotation: 0 };
    if (transform.scaleX !== 1 || transform.scaleY !== 1 || transform.rotation) {
      ctx.translate(doc.width / 2, doc.height / 2);
      ctx.rotate((transform.rotation || 0) * Math.PI / 180);
      ctx.scale(transform.scaleX ?? 1, transform.scaleY ?? 1);
      ctx.translate(-doc.width / 2, -doc.height / 2);
    }

    // Raster layers (image, transparent, or rasterized text/shape with bitmap)
    const bitmapToDraw = layer.previewBitmap || layer.imageBitmap;
    if (bitmapToDraw) {
      ctx.drawImage(bitmapToDraw, layer.x, layer.y);
    }

    // Vector text layers — render live from textData when no bitmap cached
    if (layer.type === 'text' && layer.textData && !bitmapToDraw) {
      ctx.translate(layer.x, layer.y);
      renderTextToCanvas(ctx, layer.textData, layer.width, layer.height);
    }

    // Vector shape layers — render live from shapeData when no bitmap cached
    if (layer.type === 'shape' && layer.shapeData && !bitmapToDraw) {
      ctx.translate(layer.x, layer.y);
      renderShapeToCanvas(ctx, layer.shapeData, layer.width, layer.height);
    }

    ctx.restore();
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDocument() {
  const [state, dispatch] = useReducer(docReducer, INITIAL_STATE);

  // Persistent offscreen canvas for compositing.
  const compositeCanvas = useRef(null);
  if (!compositeCanvas.current) {
    compositeCanvas.current = document.createElement('canvas');
  }

  // Re-composite whenever layers or doc change.
  useEffect(() => {
    compositeToCanvas(compositeCanvas.current, state.doc, state.layers);
  }, [state.doc, state.layers]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  /**
   * Load an image File, create a document and image layer, fit viewport.
   * Returns { error: string } on failure, or null on success.
   */
  const openImageFile = useCallback(async (file) => {
    if (!isSupportedFile(file)) {
      return { error: `Unsupported file type: "${file.type || file.name}". Please open a PNG, JPEG, or WebP image.` };
    }

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (err) {
      return { error: `Could not decode image: ${err.message ?? 'unknown error'}` };
    }

    const doc   = createDocument(bitmap.width, bitmap.height, file.name);
    const layer = createLayer(`Background`, bitmap, { x: 0, y: 0 }, 'image');

    dispatch({ type: 'OPEN_IMAGE', doc, layer });

    // Generate thumbnail asynchronously.
    makeThumbnail(bitmap).then(dataUrl => {
      dispatch({ type: 'SET_THUMBNAIL', layerId: layer.id, dataUrl });
    });

    return null; // success
  }, []);

  const selectLayer = useCallback((layerId) => {
    dispatch({ type: 'SELECT_LAYER', layerId });
  }, []);

  const toggleVisibility = useCallback((layerId) => {
    dispatch({ type: 'TOGGLE_VISIBILITY', layerId });
  }, []);

  const setLayerOpacity = useCallback((layerId, opacity) => {
    dispatch({ type: 'SET_OPACITY', layerId, opacity: Math.max(0, Math.min(100, opacity)) });
  }, []);

  const setLayerBlendMode = useCallback((layerId, blendMode) => {
    dispatch({ type: 'SET_BLEND_MODE', layerId, blendMode });
  }, []);

  const renameLayer = useCallback((layerId, name) => {
    dispatch({ type: 'RENAME_LAYER', layerId, name });
  }, []);

  const addTransparentLayer = useCallback(async () => {
    if (!state.doc) return;
    const bitmap = await makeBlankBitmap(state.doc.width, state.doc.height);
    const layer  = createLayer('Layer', bitmap, { x: 0, y: 0 }, 'transparent');
    dispatch({ type: 'ADD_LAYER', layer });
    // Transparent layer thumbnail stays null (panel shows checkerboard).
  }, [state.doc]);

  const addAdjustmentLayer = useCallback((adjustmentData = {}) => {
    if (!state.doc) return null;
    const layer = createLayer('Adjustment', null, { x: 0, y: 0 }, 'adjustment', {
      width: state.doc.width, height: state.doc.height,
      adjustmentData: { brightness: 0, contrast: 0, saturation: 0, grayscale: 0, ...adjustmentData },
    });
    dispatch({ type: 'ADD_LAYER', layer, historyLabel: 'New Adjustment Layer' });
    return layer.id;
  }, [state.doc]);

  // ─── Add Text Layer ─────────────────────────────────────────────────────────
  const addTextLayer = useCallback((textData) => {
    if (!state.doc) return null;
    const layer = createLayer(
      textData.text?.substring(0, 20) || 'Text',
      null,
      { x: 0, y: 0 },
      'text',
      {
        textData,
        width: state.doc.width,
        height: state.doc.height,
      }
    );
    dispatch({ type: 'ADD_LAYER', layer, historyLabel: 'New Text Layer' });
    makeVectorThumbnail(layer, state.doc.width, state.doc.height).then(dataUrl => {
      dispatch({ type: 'SET_THUMBNAIL', layerId: layer.id, dataUrl });
    });
    return layer.id;
  }, [state.doc]);

  // ─── Add Shape Layer ────────────────────────────────────────────────────────
  const addShapeLayer = useCallback((shapeData) => {
    if (!state.doc) return null;
    const name = `${shapeData.shapeType?.charAt(0).toUpperCase()}${shapeData.shapeType?.slice(1) || 'Shape'}`;
    const layer = createLayer(
      name,
      null,
      { x: 0, y: 0 },
      'shape',
      {
        shapeData,
        width: state.doc.width,
        height: state.doc.height,
      }
    );
    dispatch({ type: 'ADD_LAYER', layer, historyLabel: `New ${name}` });
    makeVectorThumbnail(layer, state.doc.width, state.doc.height).then(dataUrl => {
      dispatch({ type: 'SET_THUMBNAIL', layerId: layer.id, dataUrl });
    });
    return layer.id;
  }, [state.doc]);

  const duplicateLayer = useCallback((layerId) => {
    dispatch({ type: 'DUPLICATE_LAYER', layerId });
    // Re-generate thumbnail for the copy (it shares the same bitmap — OK for now).
    const src = state.layers.find(l => l.id === layerId);
    if (src?.imageBitmap) {
      makeThumbnail(src.imageBitmap).then(dataUrl => {
        // We don't know the copy's id here since it was generated inside reducer.
        // The copy inherits the src thumbnail directly — acceptable until Phase 4.
      });
    }
  }, [state.layers]);

  const deleteLayer = useCallback((layerId) => {
    if (state.layers.length <= 1) return; // guard: must keep ≥1 layer
    dispatch({ type: 'DELETE_LAYER', layerId });
  }, [state.layers.length]);

  const reorderLayer = useCallback((layerId, newIndex) => {
    dispatch({ type: 'REORDER_LAYER', layerId, newIndex });
  }, []);

  const closeDocument = useCallback(() => {
    dispatch({ type: 'CLOSE_DOCUMENT' });
  }, []);

  // ─── Crop Document ──────────────────────────────────────────────────────────
  /**
   * Crop the document and all layers to the specified rectangle in document coordinates.
   * Updates document dimensions and slices all layer pixel contents.
   * @param {{ x: number, y: number, width: number, height: number }} cropRect
   */
  const cropDocument = useCallback(async (cropRect) => {
    if (!state.doc) return;
    const { x, y, width, height } = cropRect;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const cropX = Math.round(x);
    const cropY = Math.round(y);

    const newLayers = await Promise.all(
      state.layers.map(async (layer) => {
        if (layer.type === 'adjustment') {
          return { ...layer, imageBitmap: null, previewBitmap: null, thumbnail: null, x: 0, y: 0, width: w, height: h };
        }
        // Vector layers remain editable: translate their document-space geometry
        // instead of creating an empty bitmap.
        if (layer.type === 'text' || layer.type === 'shape') {
          const textData = layer.textData && {
            ...layer.textData,
            originX: (layer.textData.originX ?? 0) - cropX,
            originY: (layer.textData.originY ?? 0) - cropY,
          };
          const shapeData = layer.shapeData && {
            ...layer.shapeData,
            x1: (layer.shapeData.x1 ?? 0) - cropX,
            y1: (layer.shapeData.y1 ?? 0) - cropY,
            x2: (layer.shapeData.x2 ?? 0) - cropX,
            y2: (layer.shapeData.y2 ?? 0) - cropY,
          };
          const next = { ...layer, textData, shapeData, x: 0, y: 0, width: w, height: h, imageBitmap: null };
          return { ...next, thumbnail: await makeVectorThumbnail(next, w, h) };
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        if (layer.imageBitmap) {
          ctx.drawImage(layer.imageBitmap, layer.x - cropX, layer.y - cropY);
        }
        const newBitmap = await createImageBitmap(c);
        const thumb = await makeThumbnail(newBitmap);
        return {
          ...layer,
          imageBitmap: newBitmap,
          thumbnail: thumb,
          x: 0,
          y: 0,
          width: w,
          height: h,
        };
      })
    );

    const newDoc = {
      ...state.doc,
      width: w,
      height: h,
    };

    dispatch({ type: 'SET_DOCUMENT_AND_LAYERS', doc: newDoc, layers: newLayers, historyLabel: 'Crop' });
  }, [state.doc, state.layers]);

  // ─── Resize Image ───────────────────────────────────────────────────────────
  /**
   * Resamples document and each layer's pixel content to new target dimensions.
   * @param {number} newWidth
   * @param {number} newHeight
   */
  const resizeImage = useCallback(async (newWidth, newHeight) => {
    if (!state.doc) return;
    const targetW = Math.max(1, Math.min(10000, Math.round(newWidth)));
    const targetH = Math.max(1, Math.min(10000, Math.round(newHeight)));
    const scaleX = targetW / state.doc.width;
    const scaleY = targetH / state.doc.height;

    const newLayers = await Promise.all(
      state.layers.map(async (layer) => {
        if (layer.type === 'adjustment') {
          return { ...layer, imageBitmap: null, previewBitmap: null, thumbnail: null, x: 0, y: 0, width: targetW, height: targetH };
        }
        if (layer.type === 'text' || layer.type === 'shape') {
          const textData = layer.textData && {
            ...layer.textData,
            originX: (layer.textData.originX ?? 0) * scaleX,
            originY: (layer.textData.originY ?? 0) * scaleY,
            fontSize: (layer.textData.fontSize ?? 32) * Math.sqrt(scaleX * scaleY),
          };
          const shapeData = layer.shapeData && {
            ...layer.shapeData,
            x1: (layer.shapeData.x1 ?? 0) * scaleX,
            y1: (layer.shapeData.y1 ?? 0) * scaleY,
            x2: (layer.shapeData.x2 ?? 0) * scaleX,
            y2: (layer.shapeData.y2 ?? 0) * scaleY,
            strokeWidth: (layer.shapeData.strokeWidth ?? 1) * Math.sqrt(scaleX * scaleY),
          };
          const next = { ...layer, textData, shapeData, x: 0, y: 0, width: targetW, height: targetH, imageBitmap: null };
          return { ...next, thumbnail: await makeVectorThumbnail(next, targetW, targetH) };
        }
        const layerW = Math.max(1, Math.round(layer.width * scaleX));
        const layerH = Math.max(1, Math.round(layer.height * scaleY));
        const layerX = Math.round(layer.x * scaleX);
        const layerY = Math.round(layer.y * scaleY);

        const c = document.createElement('canvas');
        c.width = layerW;
        c.height = layerH;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, layerW, layerH);
        if (layer.imageBitmap) {
          ctx.drawImage(layer.imageBitmap, 0, 0, layerW, layerH);
        }
        const newBitmap = await createImageBitmap(c);
        const thumb = await makeThumbnail(newBitmap);

        return {
          ...layer,
          imageBitmap: newBitmap,
          thumbnail: thumb,
          x: layerX,
          y: layerY,
          width: layerW,
          height: layerH,
        };
      })
    );

    const newDoc = {
      ...state.doc,
      width: targetW,
      height: targetH,
    };

    dispatch({ type: 'SET_DOCUMENT_AND_LAYERS', doc: newDoc, layers: newLayers, historyLabel: 'Image Size' });
  }, [state.doc, state.layers]);

  // ─── Resize Canvas ──────────────────────────────────────────────────────────
  /**
   * Changes document canvas boundaries without scaling layer pixel contents.
   * Existing layers shift based on 3x3 anchor position.
   * @param {number} newWidth
   * @param {number} newHeight
   * @param {string} anchor - 'top-left'|'top-center'|'top-right'|'center-left'|'center'|'center-right'|'bottom-left'|'bottom-center'|'bottom-right'
   */
  const resizeCanvas = useCallback(async (newWidth, newHeight, anchor = 'center') => {
    if (!state.doc) return;
    const targetW = Math.max(1, Math.min(10000, Math.round(newWidth)));
    const targetH = Math.max(1, Math.min(10000, Math.round(newHeight)));

    const diffW = targetW - state.doc.width;
    const diffH = targetH - state.doc.height;

    let offsetX = 0;
    let offsetY = 0;

    // Horizontal
    if (anchor.includes('left')) {
      offsetX = 0;
    } else if (anchor.includes('right')) {
      offsetX = diffW;
    } else {
      offsetX = Math.round(diffW / 2);
    }

    // Vertical
    if (anchor.includes('top')) {
      offsetY = 0;
    } else if (anchor.includes('bottom')) {
      offsetY = diffH;
    } else {
      offsetY = Math.round(diffH / 2);
    }

    const newLayers = state.layers.map((layer) => ({
      ...layer,
      x: layer.x + offsetX,
      y: layer.y + offsetY,
    }));

    const newDoc = {
      ...state.doc,
      width: targetW,
      height: targetH,
    };

    dispatch({ type: 'SET_DOCUMENT_AND_LAYERS', doc: newDoc, layers: newLayers, historyLabel: 'Canvas Size' });
  }, [state.doc, state.layers]);

  // ─── Filter Preview & Apply ─────────────────────────────────────────────────
  const setLayerPreview = useCallback((layerId, previewBitmap) => {
    dispatch({ type: 'SET_LAYER_PREVIEW', layerId, previewBitmap });
  }, []);

  const clearLayerPreview = useCallback((layerId) => {
    dispatch({ type: 'CLEAR_LAYER_PREVIEW', layerId });
  }, []);

  const applyLayerFilter = useCallback(async (layerId, newBitmap, filterTitle = 'Apply Filter') => {
    const layer = state.layers.find(item => item.id === layerId);
    if (!layer?.imageBitmap) return { error: 'Filters require a raster layer. Rasterize the vector layer first.' };
    const thumb = await makeThumbnail(newBitmap);
    dispatch({ type: 'APPLY_LAYER_FILTER', layerId, newBitmap, thumbnail: thumb, historyLabel: filterTitle });
    return null;
  }, [state.layers]);

  const commitLayerStroke = useCallback(async (layerId, newBitmap, historyLabel = 'Brush Stroke') => {
    const layer = state.layers.find(item => item.id === layerId);
    if (!layer?.imageBitmap) return { error: 'Brush and eraser require a raster layer.' };
    const thumb = await makeThumbnail(newBitmap);
    dispatch({ type: 'COMMIT_LAYER_STROKE', layerId, newBitmap, thumbnail: thumb, historyLabel });
    return null;
  }, [state.layers]);

  // ─── Text & Shape Data Updates ──────────────────────────────────────────────
  const updateTextData = useCallback((layerId, textData) => {
    dispatch({ type: 'UPDATE_TEXT_DATA', layerId, textData, historyLabel: 'Edit Text' });
    const layer = state.layers.find(item => item.id === layerId);
    if (layer && state.doc) makeVectorThumbnail({ ...layer, textData }, state.doc.width, state.doc.height)
      .then(dataUrl => dispatch({ type: 'SET_THUMBNAIL', layerId, dataUrl }));
  }, [state.layers, state.doc]);

  const updateShapeData = useCallback((layerId, shapeData) => {
    dispatch({ type: 'UPDATE_SHAPE_DATA', layerId, shapeData, historyLabel: 'Edit Shape' });
    const layer = state.layers.find(item => item.id === layerId);
    if (layer && state.doc) makeVectorThumbnail({ ...layer, shapeData }, state.doc.width, state.doc.height)
      .then(dataUrl => dispatch({ type: 'SET_THUMBNAIL', layerId, dataUrl }));
  }, [state.layers, state.doc]);

  const updateLayerTransform = useCallback((layerId, transform) => {
    dispatch({ type: 'UPDATE_LAYER_TRANSFORM', layerId, transform, historyLabel: 'Transform Layer' });
  }, []);
  const updateAdjustmentData = useCallback((layerId, adjustmentData) => {
    dispatch({ type: 'UPDATE_ADJUSTMENT_DATA', layerId, adjustmentData, historyLabel: 'Edit Adjustment' });
  }, []);

  // ─── Selection Actions ──────────────────────────────────────────────────────
  const setSelection = useCallback((selection) => {
    dispatch({ type: 'SET_SELECTION', selection });
  }, []);

  const deselect = useCallback(() => {
    dispatch({ type: 'DESELECT' });
  }, []);

  const invertSelection = useCallback(() => {
    dispatch({ type: 'INVERT_SELECTION' });
  }, []);

  const selectAll = useCallback(() => {
    dispatch({ type: 'SELECT_ALL' });
  }, []);

  const clearSelectionPixels = useCallback(async () => {
    if (!state.doc || !state.selection || !state.activeLayerId) return;
    const activeLayer = state.layers.find(l => l.id === state.activeLayerId);
    if (!activeLayer || !activeLayer.imageBitmap) return;

    const canvas = document.createElement('canvas');
    canvas.width = activeLayer.width;
    canvas.height = activeLayer.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(activeLayer.imageBitmap, 0, 0);

    ctx.save();
    applySelectionClip(ctx, state.selection, state.doc, { x: activeLayer.x, y: activeLayer.y });
    ctx.clearRect(0, 0, activeLayer.width, activeLayer.height);
    ctx.restore();

    const newBitmap = await createImageBitmap(canvas);
    const thumb = await makeThumbnail(newBitmap);
    dispatch({
      type: 'CLEAR_SELECTION_PIXELS',
      layerId: activeLayer.id,
      newBitmap,
      thumbnail: thumb,
      historyLabel: 'Clear Selection',
    });
  }, [state.doc, state.selection, state.activeLayerId, state.layers]);

  const moveSelectionPixels = useCallback(async (newBitmap, newSelection) => {
    if (!state.doc || !state.activeLayerId) return;
    const activeLayer = state.layers.find(l => l.id === state.activeLayerId);
    if (!activeLayer?.imageBitmap) return { error: 'Selected-pixel movement requires a raster layer.' };
    const thumb = await makeThumbnail(newBitmap);
    dispatch({
      type: 'MOVE_SELECTION_PIXELS',
      layerId: state.activeLayerId,
      newBitmap,
      thumbnail: thumb,
      newSelection,
      historyLabel: 'Move Selection',
    });
    return null;
  }, [state.doc, state.activeLayerId, state.layers]);

  // ─── History navigation actions (undo / redo / jump) ─────────────────────────
  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const jumpToHistory = useCallback((index) => {
    dispatch({ type: 'JUMP_TO_HISTORY', index });
  }, []);

  // ─── Restore a history snapshot (backward compat) ───────────────────────────
  const restoreSnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    dispatch({ type: 'RESTORE_SNAPSHOT', snapshot });
  }, []);

  const history = {
    canUndo:      state.historyIndex > 0,
    canRedo:      state.historyIndex < state.history.length - 1,
    currentIndex: state.historyIndex,
    entries: state.history.map((s, i) => ({
      index:     i,
      label:     s.label,
      timestamp: s.timestamp,
    })),
    undo,
    redo,
    jumpTo: jumpToHistory,
  };

  return {
    // State
    doc:             state.doc,
    layers:          state.layers,
    activeLayerId:   state.activeLayerId,
    selection:       state.selection,
    compositeCanvas: compositeCanvas.current,
    history,

    // Actions
    openImageFile,
    selectLayer,
    toggleVisibility,
    setLayerOpacity,
    setLayerBlendMode,
    renameLayer,
    addTransparentLayer,
    addAdjustmentLayer,
    addTextLayer,
    addShapeLayer,
    duplicateLayer,
    deleteLayer,
    reorderLayer,
    closeDocument,
    cropDocument,
    resizeImage,
    resizeCanvas,
    setLayerPreview,
    clearLayerPreview,
    applyLayerFilter,
    commitLayerStroke,
    updateTextData,
    updateShapeData,
    updateLayerTransform,
    updateAdjustmentData,
    setSelection,
    deselect,
    invertSelection,
    selectAll,
    clearSelectionPixels,
    moveSelectionPixels,
    restoreSnapshot,
    undo,
    redo,
    jumpToHistory,
  };
}
