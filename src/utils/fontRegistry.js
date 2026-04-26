// fontRegistry.js
// Single source of truth for the bundled "curated" fonts we ship in
// /public/fonts/. User-uploaded custom fonts live in IndexedDB
// (see customFontStore.js) and are merged at the UI layer.

export const DEFAULT_FONT_ID = 'noto-sans-kr';

export const CURATED_FONTS = [
    {
        id: 'noto-sans-kr',
        label: 'Noto Sans KR',
        supportsWeights: true,
        weights: {
            regular: '/fonts/NotoSansKR-Regular-subset.otf',
            bold: '/fonts/NotoSansKR-Bold-subset.otf',
        },
    },
    {
        id: 'pretendard',
        label: 'Pretendard',
        supportsWeights: true,
        weights: {
            regular: '/fonts/Pretendard-Regular-subset.otf',
            bold: '/fonts/Pretendard-Bold-subset.otf',
        },
    },
];

export function getCuratedFont(fontId) {
    return CURATED_FONTS.find((f) => f.id === fontId) || null;
}

export function isCuratedFont(fontId) {
    return CURATED_FONTS.some((f) => f.id === fontId);
}
