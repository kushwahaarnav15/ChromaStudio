/**
 * textShapeRenderer.js — Renders text and shape layer data to Canvas2D.
 *
 * All rendering is immediate-mode: given a layer's metadata, draw onto a
 * supplied canvas context at the layer's native resolution.
 *
 * Text layers store:
 *   textData: { text, fontFamily, fontSize, color, bold, italic, align, lineSpacing }
 *
 * Shape layers store:
 *   shapeData: { shapeType, fill, stroke, strokeWidth, x1, y1, x2, y2 }
 *   (Coordinates are relative to the layer origin.)
 */

// ─── Text Rendering ──────────────────────────────────────────────────────────

/**
 * Render text onto a canvas context at (0,0) of the layer.
 * The layer should have been sized to the document dimensions.
 */
export function renderTextToCanvas(ctx, textData, layerWidth, layerHeight) {
  if (!textData || !textData.text) return;

  const {
    text,
    fontFamily = 'Inter',
    fontSize = 32,
    color = '#ffffff',
    bold = false,
    italic = false,
    align = 'left',
    lineSpacing = 1.3,
    originX = 0,
    originY = 0,
  } = textData;

  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textAlign = align;

  const weight = bold ? 'bold' : 'normal';
  const style = italic ? 'italic' : 'normal';
  ctx.font = `${style} ${weight} ${fontSize}px "${fontFamily}", sans-serif`;
  ctx.fillStyle = color;

  const lines = text.split('\n');
  const lineHeight = fontSize * lineSpacing;

  let anchorX = originX;
  if (align === 'center') anchorX = originX;
  else if (align === 'right') anchorX = originX;

  for (let i = 0; i < lines.length; i++) {
    const y = originY + i * lineHeight;
    ctx.fillText(lines[i], anchorX, y);
  }

  ctx.restore();
}

/**
 * Rasterize a text layer into an ImageBitmap.
 * @param {object} textData
 * @param {number} docWidth
 * @param {number} docHeight
 * @returns {Promise<ImageBitmap>}
 */
export async function rasterizeTextLayer(textData, docWidth, docHeight) {
  const c = document.createElement('canvas');
  c.width = docWidth;
  c.height = docHeight;
  const ctx = c.getContext('2d');
  renderTextToCanvas(ctx, textData, docWidth, docHeight);
  return createImageBitmap(c);
}

// ─── Shape Rendering ─────────────────────────────────────────────────────────

/**
 * Render a shape onto a canvas context.
 * Shape coordinates are relative to the layer origin (which matches the doc origin).
 */
export function renderShapeToCanvas(ctx, shapeData, layerWidth, layerHeight) {
  if (!shapeData) return;

  const {
    shapeType,
    fill = '#3b82f6',
    stroke = 'none',
    strokeWidth = 2,
    x1 = 0,
    y1 = 0,
    x2 = 100,
    y2 = 100,
  } = shapeData;

  ctx.save();

  const hasFill = fill && fill !== 'none' && fill !== 'transparent';
  const hasStroke = stroke && stroke !== 'none' && stroke !== 'transparent' && strokeWidth > 0;

  switch (shapeType) {
    case 'rect': {
      const rx = Math.min(x1, x2);
      const ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1);
      const rh = Math.abs(y2 - y1);
      if (hasFill) {
        ctx.fillStyle = fill;
        ctx.fillRect(rx, ry, rw, rh);
      }
      if (hasStroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth;
        ctx.strokeRect(rx, ry, rw, rh);
      }
      break;
    }
    case 'ellipse': {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
      if (hasFill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (hasStroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();
      }
      break;
    }
    case 'line': {
      if (hasStroke || hasFill) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = stroke !== 'none' ? stroke : fill;
        ctx.lineWidth = strokeWidth || 2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }

  ctx.restore();
}

/**
 * Rasterize a shape layer into an ImageBitmap.
 * @param {object} shapeData
 * @param {number} docWidth
 * @param {number} docHeight
 * @returns {Promise<ImageBitmap>}
 */
export async function rasterizeShapeLayer(shapeData, docWidth, docHeight) {
  const c = document.createElement('canvas');
  c.width = docWidth;
  c.height = docHeight;
  const ctx = c.getContext('2d');
  renderShapeToCanvas(ctx, shapeData, docWidth, docHeight);
  return createImageBitmap(c);
}

// ─── Thumbnail helpers ───────────────────────────────────────────────────────

const THUMB_W = 40;
const THUMB_H = 32;

/**
 * Generate a thumbnail for a text or shape layer (renders to small canvas).
 */
export async function makeVectorThumbnail(layer, docWidth, docHeight) {
  const full = document.createElement('canvas');
  full.width = docWidth;
  full.height = docHeight;
  const fCtx = full.getContext('2d');

  if (layer.type === 'text' && layer.textData) {
    renderTextToCanvas(fCtx, layer.textData, docWidth, docHeight);
  } else if (layer.type === 'shape' && layer.shapeData) {
    renderShapeToCanvas(fCtx, layer.shapeData, docWidth, docHeight);
  }

  const c = document.createElement('canvas');
  c.width = THUMB_W;
  c.height = THUMB_H;
  const ctx = c.getContext('2d');
  const scale = Math.min(THUMB_W / docWidth, THUMB_H / docHeight);
  const dw = docWidth * scale;
  const dh = docHeight * scale;
  const dx = (THUMB_W - dw) / 2;
  const dy = (THUMB_H - dh) / 2;
  ctx.clearRect(0, 0, THUMB_W, THUMB_H);
  ctx.drawImage(full, dx, dy, dw, dh);
  return c.toDataURL('image/png');
}
