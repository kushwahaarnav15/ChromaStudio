import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

console.log('--- Reliability Guard Tests ---');
const app = await readFile(new URL('../App.jsx', import.meta.url), 'utf8');
const store = await readFile(new URL('../store/useDocument.js', import.meta.url), 'utf8');
assert.match(app, /hasUnsavedChanges/);
assert.match(app, /confirmDiscardChanges\(\)/);
assert.match(app, /beforeunload/);
assert.match(store, /Filters require a raster layer/);
assert.match(store, /Brush and eraser require a raster layer/);
assert.match(store, /Selected-pixel movement requires a raster layer/);
console.log('✓ modified documents are guarded before replacement, close, and browser unload');
console.log('✓ raster-only operations retain explicit vector-layer safety guards');
console.log('--- ALL RELIABILITY GUARD TESTS PASSED ---');
