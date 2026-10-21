/**
 * useHistory — ChromaStudio Phase 6 undo/redo history engine.
 *
 * STRATEGY: Snapshot-based with ref-counted ImageBitmap management.
 *
 * Each snapshot stores full doc metadata + per-layer ImageBitmap references.
 *
 * KEY INSIGHT about pixel safety:
 *   - Pixel-mutating ops (filter, crop, resize) produce NEW ImageBitmap objects.
 *     The old bitmaps stay in the pre-mutation snapshot untouched — no clone needed.
 *   - Metadata-only ops (opacity, visibility, rename, reorder) share bitmap refs
 *     safely because ImageBitmap objects are immutable once created.
 *
 * Memory management:
 *   - MAX_HISTORY_ENTRIES (50) caps the stack.
 *   - A ref-count map tracks each bitmap; .close() fires when refcount → 0,
 *     freeing GPU/browser memory for bitmaps no longer in any snapshot.
 *   - previewBitmap is NEVER snapshotted (always cleared before Apply commits).
 *
 * Trade-offs:
 *   - Memory cost per snapshot ≈ (small layer-metadata objects) + bitmap refs.
 *   - After a crop/filter, the old full-res bitmap is retained by the snapshot
 *     until that snapshot is evicted or undo jumps past it.
 *   - Mitigated by: MAX_HISTORY_ENTRIES limit + eager release on eviction.
 */

export const MAX_HISTORY_ENTRIES = 50;

// ─── Ref-count map for ImageBitmaps ─────────────────────────────────────────
const bitmapRefs = new Map();

export function retainBitmap(bmp) {
  if (!bmp) return;
  bitmapRefs.set(bmp, (bitmapRefs.get(bmp) ?? 0) + 1);
}

export function releaseBitmap(bmp) {
  if (!bmp) return;
  const n = bitmapRefs.get(bmp);
  if (n === undefined) return;
  if (n <= 1) {
    bitmapRefs.delete(bmp);
    try {
      bmp.close();
    } catch (_) {
      /* already closed */
    }
  } else {
    bitmapRefs.set(bmp, n - 1);
  }
}

// ─── Snapshot helpers ────────────────────────────────────────────────────────
export function captureSnapshot(doc, layers, activeLayerId, label, selection = null) {
  const layerSnaps = layers.map((l) => {
    const bmp = l.imageBitmap ?? null;
    retainBitmap(bmp);
    return {
      id:          l.id,
      name:        l.name,
      type:        l.type,
      imageBitmap: bmp,
      thumbnail:   l.thumbnail,
      visible:     l.visible,
      opacity:     l.opacity,
      blendMode:   l.blendMode,
      x:           l.x,
      y:           l.y,
      width:       l.width,
      height:      l.height,
      // Vector layer metadata (text & shape)
      textData:    l.textData  ? { ...l.textData }  : null,
      shapeData:   l.shapeData ? { ...l.shapeData } : null,
      adjustmentData: l.adjustmentData ? { ...l.adjustmentData } : null,
      transform: l.transform ? { ...l.transform } : { scaleX: 1, scaleY: 1, rotation: 0 },
    };
  });
  return {
    label,
    timestamp:    Date.now(),
    doc:          doc ? { ...doc } : null,
    layers:       layerSnaps,
    activeLayerId,
    selection:    selection ? { ...selection } : null,
  };
}

export function releaseSnapshot(snap) {
  if (!snap || !snap.layers) return;
  for (const l of snap.layers) {
    releaseBitmap(l.imageBitmap);
  }
}
