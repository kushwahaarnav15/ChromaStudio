/**
 * ChromaStudio Pixel Filter Engine
 *
 * Implements mathematically accurate, high-performance pixel operations
 * working directly on ImageData buffers.
 *
 * All operations:
 *   - Clamp color channels strictly to [0, 255]
 *   - Preserve alpha channels appropriately
 *   - Use alpha-premultiplied weighting for blur to prevent dark fringes
 *   - Use a normalized 3x3 Laplacian/unsharp convolution kernel for sharpening
 */

// ─── ImageData Helper ────────────────────────────────────────────────────────

/**
 * Extracts a new, independent ImageData copy from an ImageBitmap.
 * @param {ImageBitmap} imageBitmap
 * @returns {ImageData | null}
 */
export function extractImageData(imageBitmap) {
  if (!imageBitmap || imageBitmap.width <= 0 || imageBitmap.height <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imageBitmap, 0, 0);
  try {
    return ctx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);
  } catch (err) {
    console.error('Failed to read image data:', err);
    return null;
  }
}

/**
 * Converts ImageData into a newly allocated ImageBitmap.
 * @param {ImageData} imageData
 * @returns {Promise<ImageBitmap>}
 */
export async function createBitmapFromImageData(imageData) {
  return createImageBitmap(imageData);
}

// ─── 1. Invert ───────────────────────────────────────────────────────────────

/**
 * Inverts RGB color channels: 255 - channel.
 * Preserves alpha channel completely.
 */
export function applyInvert(imageData) {
  const data = imageData.data;
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    data[i]     = 255 - data[i];     // Red
    data[i + 1] = 255 - data[i + 1]; // Green
    data[i + 2] = 255 - data[i + 2]; // Blue
    // data[i + 3] (Alpha) is unchanged
  }
  return imageData;
}

// ─── 2. Grayscale ────────────────────────────────────────────────────────────

/**
 * Standard ITU-R BT.601 / Rec. 709 luminance conversion:
 *   Y = 0.299*R + 0.587*G + 0.114*B
 * Allows partial blending via amount (0 to 1). Preserves alpha.
 */
export function applyGrayscale(imageData, amount = 1) {
  const data = imageData.data;
  const len = data.length;
  const amt = Math.max(0, Math.min(1, amount));

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    data[i]     = Math.min(255, Math.max(0, Math.round(r + (gray - r) * amt)));
    data[i + 1] = Math.min(255, Math.max(0, Math.round(g + (gray - g) * amt)));
    data[i + 2] = Math.min(255, Math.max(0, Math.round(b + (gray - b) * amt)));
    // Alpha unchanged
  }
  return imageData;
}

// ─── 3. Sepia ────────────────────────────────────────────────────────────────

/**
 * W3C standard Sepia transformation matrix.
 * Allows partial blending via amount (0 to 1). Preserves alpha.
 */
export function applySepia(imageData, amount = 1) {
  const data = imageData.data;
  const len = data.length;
  const amt = Math.max(0, Math.min(1, amount));

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const sr = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
    const sg = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
    const sb = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);

    data[i]     = Math.min(255, Math.max(0, Math.round(r + (sr - r) * amt)));
    data[i + 1] = Math.min(255, Math.max(0, Math.round(g + (sg - g) * amt)));
    data[i + 2] = Math.min(255, Math.max(0, Math.round(b + (sb - b) * amt)));
    // Alpha unchanged
  }
  return imageData;
}

// ─── 4. Brightness & Contrast ────────────────────────────────────────────────

/**
 * Brightness: -100 to +100
 * Contrast:   -100 to +100
 * Applies brightness shift and contrast scaling around midpoint 128.
 * Preserves alpha.
 */
export function applyBrightnessContrast(imageData, brightness = 0, contrast = 0) {
  const data = imageData.data;
  const len = data.length;

  const bOffset = brightness * 2.55;
  // Standard contrast factor formula
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < len; i += 4) {
    let r = data[i] + bOffset;
    let g = data[i + 1] + bOffset;
    let b = data[i + 2] + bOffset;

    r = factor * (r - 128) + 128;
    g = factor * (g - 128) + 128;
    b = factor * (b - 128) + 128;

    data[i]     = Math.min(255, Math.max(0, Math.round(r)));
    data[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
    data[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
    // Alpha unchanged
  }
  return imageData;
}

// ─── 5. Hue & Saturation ─────────────────────────────────────────────────────

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const val = Math.round(l * 255);
    return [val, val, val];
  }

  const hue2rgb = (p, q, t) => {
    let v = t;
    if (v < 0) v += 1;
    if (v > 1) v -= 1;
    if (v < 1 / 6) return p + (q - p) * 6 * v;
    if (v < 1 / 2) return q;
    if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);

  return [
    Math.min(255, Math.max(0, Math.round(r * 255))),
    Math.min(255, Math.max(0, Math.round(g * 255))),
    Math.min(255, Math.max(0, Math.round(b * 255))),
  ];
}

/**
 * Hue:        -180 to +180 deg
 * Saturation: -100 to +100 %
 * Lightness:  -100 to +100 %
 * Preserves alpha.
 */
export function applyHueSaturation(imageData, hue = 0, saturation = 0, lightness = 0) {
  const data = imageData.data;
  const len = data.length;
  const hDelta = hue / 360;
  const sDelta = saturation / 100;
  const lDelta = lightness / 100;

  for (let i = 0; i < len; i += 4) {
    if (data[i + 3] === 0) continue; // Skip fully transparent pixels

    let [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);

    // Shift Hue
    h = (h + hDelta) % 1;
    if (h < 0) h += 1;

    // Shift Saturation
    if (sDelta > 0) {
      s = s + (1 - s) * sDelta;
    } else {
      s = s + s * sDelta;
    }
    s = Math.max(0, Math.min(1, s));

    // Shift Lightness
    if (lDelta > 0) {
      l = l + (1 - l) * lDelta;
    } else {
      l = l + l * lDelta;
    }
    l = Math.max(0, Math.min(1, l));

    const [nr, ng, nb] = hslToRgb(h, s, l);
    data[i]     = nr;
    data[i + 1] = ng;
    data[i + 2] = nb;
    // Alpha unchanged
  }
  return imageData;
}

// ─── 6. Gaussian Blur (Separable 1D with Alpha Weighting) ────────────────────

/**
 * High-performance 2-pass (horizontal + vertical) Gaussian blur.
 * Uses alpha-premultiplied weighting to eliminate dark fringes around transparent edges.
 *
 * @param {ImageData} imageData
 * @param {number} radius - Blur radius in pixels (1 to 30)
 */
export function applyGaussianBlur(imageData, radius = 3) {
  const r = Math.max(1, Math.min(30, Math.round(radius)));
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;

  // Generate 1D Gaussian kernel
  const sigma = Math.max(r / 2.5, 0.8);
  const size = r * 2 + 1;
  const kernel = new Float32Array(size);
  let kernelSum = 0;

  for (let i = -r; i <= r; i++) {
    const val = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + r] = val;
    kernelSum += val;
  }
  for (let i = 0; i < size; i++) {
    kernel[i] /= kernelSum;
  }

  // Temporary buffer for horizontal pass: Float32Array per pixel [r, g, b, a]
  const temp = new Float32Array(width * height * 4);

  // ── Pass 1: Horizontal Blur ──
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      let sumWeight = 0;

      for (let k = -r; k <= r; k++) {
        const nx = Math.min(width - 1, Math.max(0, x + k));
        const idx = rowOffset + nx * 4;
        const kw = kernel[k + r];

        const a = src[idx + 3];
        const alphaWeight = kw * (a / 255);

        sumR += src[idx] * alphaWeight;
        sumG += src[idx + 1] * alphaWeight;
        sumB += src[idx + 2] * alphaWeight;
        sumWeight += alphaWeight;
        sumA += a * kw;
      }

      const outIdx = rowOffset + x * 4;
      if (sumWeight > 0.0001) {
        temp[outIdx]     = sumR / sumWeight;
        temp[outIdx + 1] = sumG / sumWeight;
        temp[outIdx + 2] = sumB / sumWeight;
      } else {
        temp[outIdx]     = 0;
        temp[outIdx + 1] = 0;
        temp[outIdx + 2] = 0;
      }
      temp[outIdx + 3] = sumA;
    }
  }

  // ── Pass 2: Vertical Blur ──
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      let sumWeight = 0;

      for (let k = -r; k <= r; k++) {
        const ny = Math.min(height - 1, Math.max(0, y + k));
        const idx = (ny * width + x) * 4;
        const kw = kernel[k + r];

        const a = temp[idx + 3];
        const alphaWeight = kw * (a / 255);

        sumR += temp[idx] * alphaWeight;
        sumG += temp[idx + 1] * alphaWeight;
        sumB += temp[idx + 2] * alphaWeight;
        sumWeight += alphaWeight;
        sumA += a * kw;
      }

      const outIdx = (y * width + x) * 4;
      if (sumWeight > 0.0001) {
        src[outIdx]     = Math.min(255, Math.max(0, Math.round(sumR / sumWeight)));
        src[outIdx + 1] = Math.min(255, Math.max(0, Math.round(sumG / sumWeight)));
        src[outIdx + 2] = Math.min(255, Math.max(0, Math.round(sumB / sumWeight)));
      } else {
        src[outIdx]     = 0;
        src[outIdx + 1] = 0;
        src[outIdx + 2] = 0;
      }
      src[outIdx + 3] = Math.min(255, Math.max(0, Math.round(sumA)));
    }
  }

  return imageData;
}

// ─── 7. Sharpen (3x3 Normalized Convolution Kernel) ─────────────────────────

/**
 * Sharpen convolution filter.
 * Uses a normalized Laplacian-style 3x3 kernel:
 *   [  0,   -k,   0 ]
 *   [ -k, 1+4k,  -k ]
 *   [  0,   -k,   0 ]
 * Kernel sum = 1, preserving overall scene brightness.
 * Preserves alpha and clamps channels to [0, 255].
 *
 * @param {ImageData} imageData
 * @param {number} strength - Sharpen intensity (0.1 to 3.0, default 1.0)
 */
export function applySharpen(imageData, strength = 1.0) {
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;
  const output = new Uint8ClampedArray(src.length);

  const k = Math.max(0.1, Math.min(3.0, strength)) * 0.4;
  const centerWeight = 1 + 4 * k;

  for (let y = 0; y < height; y++) {
    const yAbove = Math.max(0, y - 1);
    const yBelow = Math.min(height - 1, y + 1);

    for (let x = 0; x < width; x++) {
      const xLeft = Math.max(0, x - 1);
      const xRight = Math.min(width - 1, x + 1);

      const idxCenter = (y * width + x) * 4;
      const idxTop    = (yAbove * width + x) * 4;
      const idxBottom = (yBelow * width + x) * 4;
      const idxLeft   = (y * width + xLeft) * 4;
      const idxRight  = (y * width + xRight) * 4;

      // Only sharpen where alpha > 0
      const a = src[idxCenter + 3];
      if (a === 0) {
        output[idxCenter]     = 0;
        output[idxCenter + 1] = 0;
        output[idxCenter + 2] = 0;
        output[idxCenter + 3] = 0;
        continue;
      }

      for (let c = 0; c < 3; c++) {
        const val =
          centerWeight * src[idxCenter + c] -
          k * (src[idxTop + c] + src[idxBottom + c] + src[idxLeft + c] + src[idxRight + c]);

        output[idxCenter + c] = Math.min(255, Math.max(0, Math.round(val)));
      }
      output[idxCenter + 3] = a; // Preserve alpha exactly
    }
  }

  src.set(output);
  return imageData;
}

import { applySelectionClip } from './selectionUtils';

// ─── Master Pipeline Dispatcher ──────────────────────────────────────────────

/**
 * Executes a filter on an ImageBitmap and returns a new ImageBitmap.
 * @param {ImageBitmap} imageBitmap
 * @param {string} filterType - 'invert'|'grayscale'|'sepia'|'brightness-contrast'|'hue-saturation'|'blur'|'sharpen'
 * @param {object} options - filter options, may include selection, doc, layerOffset
 * @returns {Promise<ImageBitmap>}
 */
export async function executeFilter(imageBitmap, filterType, options = {}) {
  const imageData = extractImageData(imageBitmap);
  if (!imageData) throw new Error('Could not read pixel data from layer');

  switch (filterType) {
    case 'invert':
      applyInvert(imageData);
      break;
    case 'grayscale':
      applyGrayscale(imageData, options.amount ?? 1);
      break;
    case 'sepia':
      applySepia(imageData, options.amount ?? 1);
      break;
    case 'brightness-contrast':
      applyBrightnessContrast(imageData, options.brightness ?? 0, options.contrast ?? 0);
      break;
    case 'hue-saturation':
      applyHueSaturation(imageData, options.hue ?? 0, options.saturation ?? 0, options.lightness ?? 0);
      break;
    case 'blur':
      applyGaussianBlur(imageData, options.radius ?? 4);
      break;
    case 'sharpen':
      applySharpen(imageData, options.strength ?? 1.0);
      break;
    default:
      throw new Error(`Unknown filter type: ${filterType}`);
  }

  const filteredBitmap = await createBitmapFromImageData(imageData);

  // If a selection is provided, clip filter modifications strictly to the selection
  if (options.selection) {
    const canvas = document.createElement('canvas');
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    const ctx = canvas.getContext('2d');
    // 1. Draw original unfiltered pixels
    ctx.drawImage(imageBitmap, 0, 0);
    // 2. Clip to selection region
    ctx.save();
    applySelectionClip(ctx, options.selection, options.doc, options.layerOffset);
    // 3. Draw filtered pixels strictly inside selection
    ctx.drawImage(filteredBitmap, 0, 0);
    ctx.restore();

    filteredBitmap.close?.();
    return createImageBitmap(canvas);
  }

  return filteredBitmap;
}
