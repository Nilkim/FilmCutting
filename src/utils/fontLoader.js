// fontLoader.js
// Two-tier font loader:
//   1) Curated fonts shipped under /public/fonts/ (see fontRegistry.js)
//   2) User-uploaded fonts persisted in IndexedDB (see customFontStore.js)
//
// Cache key is `${fontId}:${weight}` so each (family, weight) combination
// is only fetched/parsed once per session. On any failure (network, missing
// IndexedDB entry) we fall back to the default font instead of throwing —
// keeps the canvas usable even after stale shape state.

import opentype from 'opentype.js';
import {
    CURATED_FONTS,
    DEFAULT_FONT_ID,
    getCuratedFont,
} from './fontRegistry.js';
import { getCustomFontBlob } from './customFontStore.js';

const cache = {};

export async function loadFont(fontId = DEFAULT_FONT_ID, weight = 'regular') {
    const id = fontId || DEFAULT_FONT_ID;
    const w = weight || 'regular';
    const key = `${id}:${w}`;
    if (cache[key]) return cache[key];

    // (1) Curated font?
    const curated = getCuratedFont(id);
    if (curated) {
        const url = curated.weights[w] || curated.weights.regular;
        cache[key] = opentype.load(url).catch((err) => {
            delete cache[key];
            throw err;
        });
        return cache[key];
    }

    // (2) Custom uploaded font (IndexedDB) — weight is ignored (single
    //     uploaded file). Cache under the requested key anyway so callers
    //     don't need to know the difference.
    try {
        const blob = await getCustomFontBlob(id);
        if (blob) {
            const buf = await blob.arrayBuffer();
            cache[key] = Promise.resolve(opentype.parse(buf));
            return cache[key];
        }
    } catch {
        // fall through to default fallback
    }

    // (3) Fallback: requested font not found anywhere → default. Prevents
    //     a confused empty render after the user clears IndexedDB or loads
    //     an old order whose custom font is no longer available.
    if (id !== DEFAULT_FONT_ID) {
        return loadFont(DEFAULT_FONT_ID, w);
    }
    throw new Error(`Default font failed to load: ${DEFAULT_FONT_ID}`);
}

// Returns an array of characters in `text` that the font has no glyph for.
// opentype.js maps unknown chars to .notdef (index 0), which would render as
// an empty rectangle — catching these early lets the UI warn the user before
// they send the order to cutting.
export function findMissingGlyphs(font, text) {
    if (!font || !text) return [];
    const missing = [];
    for (const ch of text) {
        if (/\s/.test(ch)) continue;
        const glyph = font.charToGlyph(ch);
        if (!glyph || glyph.index === 0) {
            missing.push(ch);
        }
    }
    return [...new Set(missing)];
}

// Re-export for callers that want to render a font picker without importing
// fontRegistry directly.
export { CURATED_FONTS, DEFAULT_FONT_ID };
