/**
 * exportDocument — ChromaStudio Phase 6 export pipeline.
 *
 * Composites visible layers at native document resolution and triggers a
 * browser download via a temporary object URL.
 * All processing is local; nothing is uploaded to any server.
 */

import { compositeToCanvas } from '../store/useDocument';

// ─── Detect supported export formats (evaluated once) ────────────────────────
function detectSupportedFormats() {
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const fmts = [];
  if (probe.toDataURL('image/png').startsWith('data:image/png'))   fmts.push('png');
  if (probe.toDataURL('image/jpeg').startsWith('data:image/jpeg')) fmts.push('jpeg');
  if (probe.toDataURL('image/webp').startsWith('data:image/webp')) fmts.push('webp');
  return fmts;
}

/** Array of format strings supported by this browser: 'png', 'jpeg', 'webp' */
export const SUPPORTED_EXPORT_FORMATS = detectSupportedFormats();

// ─── Canvas builder ───────────────────────────────────────────────────────────
/**
 * Build an export-ready canvas from doc + layers.
 * Optionally fills transparent areas with a background color (for JPEG).
 *
 * @param {{ width: number, height: number }} doc
 * @param {Array}  layers
 * @param {string|null} bgColor  CSS color, or null to keep transparency
 * @returns {HTMLCanvasElement}
 */
export function buildExportCanvas(doc, layers, bgColor = null) {
  const canvas  = document.createElement('canvas');
  canvas.width  = doc.width;
  canvas.height = doc.height;
  compositeToCanvas(canvas, doc, layers, bgColor);
  return canvas;
}

// ─── Size estimator ───────────────────────────────────────────────────────────
/**
 * Estimate export file size in KB by encoding the canvas and measuring the
 * resulting base64 payload.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {'png'|'jpeg'|'webp'} format
 * @param {number} quality  0-1, used for jpeg/webp
 * @returns {number} size in KB (rounded integer)
 */
export function estimateSizeKB(canvas, format, quality = 0.92) {
  const mime    = mimeFor(format);
  const dataUrl = canvas.toDataURL(mime, quality);
  const base64  = dataUrl.split(',')[1] ?? '';
  return Math.round(base64.length * 0.75 / 1024);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mimeFor(format) {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

// ─── Main export function ─────────────────────────────────────────────────────
/**
 * Composite the document and trigger a browser download.
 *
 * @param {{ width: number, height: number, name: string }} doc
 * @param {Array}  layers         – full layer array (useDocument state)
 * @param {'png'|'jpeg'|'webp'} format
 * @param {object} opts
 * @param {string}  opts.filename  – without extension; defaults to doc.name
 * @param {number}  opts.quality   – JPEG/WebP quality 0-1 (default 0.92)
 * @param {string}  opts.bgColor   – background fill color for JPEG (default '#ffffff')
 * @returns {Promise<void>}
 * @throws if format is unsupported, doc is null, or toBlob fails
 */
export async function exportDocument(doc, layers, format, opts = {}) {
  if (!SUPPORTED_EXPORT_FORMATS.includes(format)) {
    throw new Error(`Export format "${format}" is not supported by this browser.`);
  }
  if (!doc) throw new Error('No document is open.');

  const {
    filename = doc.name?.replace(/\.[^.]+$/, '') ?? 'export',
    quality  = 0.92,
    bgColor  = format === 'jpeg' ? '#ffffff' : null,
  } = opts;

  const mime   = mimeFor(format);
  const ext    = format === 'jpeg' ? 'jpg' : format;
  const canvas = buildExportCanvas(doc, layers, bgColor);

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas export failed — toBlob returned null.'));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href        = url;
        a.download    = `${filename}.${ext}`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        // Revoke the object URL after a short delay so the download can start.
        setTimeout(() => {
          URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 2000);
        resolve();
      }, mime, quality);
    } catch (err) {
      reject(err);
    }
  });
}
