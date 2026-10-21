/**
 * selectionUtils.js — ChromaStudio Selection Engine
 *
 * Implements:
 *   - Document-space selection model (rect and ellipse)
 *   - Normalized bounding box math with coordinate clamping
 *   - Accurate point-in-selection hit testing (supporting inverted selections)
 *   - Canvas 2D clipping masks (using standard clip and evenodd winding rule for inverse)
 *   - Pixel extraction, clearing, and moving helpers
 */

/**
 * Normalizes start and current pointer coordinates into a positive-dimension selection,
 * clamping coordinates strictly to document boundaries.
 * Supports Shift key to constrain to a 1:1 square or 1:1 circle.
 */
export function normalizeSelection(type, startX, startY, currentX, currentY, doc, isShift = false) {
  const docW = doc?.width ?? 10000;
  const docH = doc?.height ?? 10000;

  const x0 = Math.max(0, Math.min(docW, startX));
  const y0 = Math.max(0, Math.min(docH, startY));
  let x1 = Math.max(0, Math.min(docW, currentX));
  let y1 = Math.max(0, Math.min(docH, currentY));

  let dx = x1 - x0;
  let dy = y1 - y0;

  if (isShift) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = dx >= 0 ? size : -size;
    dy = dy >= 0 ? size : -size;

    // Clamp within document bounds
    if (x0 + dx < 0) dx = -x0;
    if (x0 + dx > docW) dx = docW - x0;
    if (y0 + dy < 0) dy = -y0;
    if (y0 + dy > docH) dy = docH - y0;

    const squareSize = Math.min(Math.abs(dx), Math.abs(dy));
    dx = dx >= 0 ? squareSize : -squareSize;
    dy = dy >= 0 ? squareSize : -squareSize;
  }

  const left = dx >= 0 ? x0 : x0 + dx;
  const top  = dy >= 0 ? y0 : y0 + dy;
  const width = Math.abs(dx);
  const height = Math.abs(dy);

  return {
    type: type === 'ellipse' ? 'ellipse' : 'rect',
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
    inverted: false,
  };
}

/**
 * Tests whether a point (docX, docY) in document coordinates is inside the selection.
 * Properly accounts for rectangular, elliptical, and inverted selections.
 */
export function isPointInSelection(docX, docY, selection, doc) {
  if (!selection) return false;
  const docW = doc?.width ?? Infinity;
  const docH = doc?.height ?? Infinity;

  // Must be within document bounds
  const inDoc = docX >= 0 && docX <= docW && docY >= 0 && docY <= docH;
  if (!inDoc) return false;

  let inBase = false;
  if (selection.type === 'ellipse') {
    const rx = selection.width / 2;
    const ry = selection.height / 2;
    if (rx <= 0 || ry <= 0) return false;
    const cx = selection.x + rx;
    const cy = selection.y + ry;
    const dx = (docX - cx) / rx;
    const dy = (docY - cy) / ry;
    inBase = (dx * dx + dy * dy) <= 1.0;
  } else {
    inBase = docX >= selection.x &&
             docX <= selection.x + selection.width &&
             docY >= selection.y &&
             docY <= selection.y + selection.height;
  }

  return selection.inverted ? !inBase : inBase;
}

/**
 * Applies a 2D canvas clipping path for the active selection.
 * Supports inverted selections via the evenodd winding rule against the document boundary.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} selection - { type, x, y, width, height, inverted }
 * @param {{ width: number, height: number }} doc
 * @param {{ x: number, y: number }} [layerOffset] - layer position offset (layer.x, layer.y)
 */
export function applySelectionClip(ctx, selection, doc, layerOffset = { x: 0, y: 0 }) {
  if (!selection || selection.width <= 0 || selection.height <= 0) return;

  const offX = layerOffset?.x || 0;
  const offY = layerOffset?.y || 0;
  const sx = selection.x - offX;
  const sy = selection.y - offY;
  const sw = Math.max(0.1, selection.width);
  const sh = Math.max(0.1, selection.height);

  const docW = doc?.width ?? 10000;
  const docH = doc?.height ?? 10000;
  const docX = 0 - offX;
  const docY = 0 - offY;

  ctx.beginPath();
  if (selection.inverted) {
    // Outer boundary (document rectangle)
    ctx.rect(docX, docY, docW, docH);
    // Inner boundary to cut out
    if (selection.type === 'ellipse') {
      const rx = sw / 2;
      const ry = sh / 2;
      ctx.ellipse(sx + rx, sy + ry, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
    } else {
      ctx.rect(sx, sy, sw, sh);
    }
    ctx.clip('evenodd');
  } else {
    if (selection.type === 'ellipse') {
      const rx = sw / 2;
      const ry = sh / 2;
      ctx.ellipse(sx + rx, sy + ry, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
    } else {
      ctx.rect(sx, sy, sw, sh);
    }
    ctx.clip();
  }
}

/**
 * Creates a brand new ImageBitmap with the selected pixels cleared to transparent (rgba(0,0,0,0)).
 * Preserves all pixels outside the selection completely.
 */
export async function clearPixelsInSelection(imageBitmap, selection, doc, layerOffset = { x: 0, y: 0 }) {
  if (!imageBitmap || !selection) return imageBitmap;

  const canvas = document.createElement('canvas');
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(imageBitmap, 0, 0);
  ctx.save();
  applySelectionClip(ctx, selection, doc, layerOffset);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  return createImageBitmap(canvas);
}
