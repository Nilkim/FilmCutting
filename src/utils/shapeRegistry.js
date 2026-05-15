// shapeRegistry.js
// Single source of truth for parametric shape kinds: their default params,
// human label, and the generator that converts params → pathData.
//
// Used by both the auto-create flow (clicking a sidebar tool button) and
// the live spec editor (ShapeSpecEditor) so a kind is added in exactly one
// place when extending the system.

import {
    generateRectPath,
    generateCirclePath,
    generateTrianglePath,
    generateStarPath,
    generateBubblePath,
    generateTextPath,
    generateArchPath,
} from './shapeGenerators';

export const KIND_LABELS = {
    rect: '사각형',
    circle: '원/타원',
    triangle: '삼각형',
    star: '별',
    bubble: '말풍선',
    arch: '아치',
    text: '텍스트',
};

export const DEFAULT_PARAMS = {
    rect: { width: 100, height: 100, fillet: 0 },
    circle: { width: 100, height: 100 },
    triangle: { width: 100, height: 100, fillet: 0 },
    star: {
        width: 100, height: 100, points: 5, innerRatio: 0.5, fillet: 0,
    },
    bubble: {
        width: 120, height: 80, tailAngle: 180, tailSize: 20, fillet: 8,
    },
    arch: {
        width: 100, height: 150, archHeight: 50, fillet: 0,
    },
    text: { text: '텍스트', size: 30, fontId: 'noto-sans-kr', weight: 'regular' },
};

// Always returns a Promise so callers can `await` uniformly even though
// most generators are synchronous (only text waits on font load).
export function generateForKind(kind, params) {
    switch (kind) {
        case 'rect':
            return Promise.resolve(generateRectPath(params));
        case 'circle':
            return Promise.resolve(generateCirclePath(params));
        case 'triangle':
            return Promise.resolve(generateTrianglePath(params));
        case 'star':
            return Promise.resolve(generateStarPath(params));
        case 'bubble':
            return Promise.resolve(generateBubblePath(params));
        case 'arch':
            return Promise.resolve(generateArchPath(params));
        case 'text':
            return generateTextPath(params);
        default:
            return Promise.reject(new Error(`Unknown shape kind: ${kind}`));
    }
}

// Builds a fresh shape with default params for the given kind. Returns the
// portion that needs the generator: { kind, params, pathData, width, height }.
// Caller wraps it with id, type, x/y, scale, rotation.
export async function createDefaultShapeData(kind) {
    const params = { ...(DEFAULT_PARAMS[kind] || {}) };
    const result = await generateForKind(kind, params);
    return {
        kind,
        params,
        pathData: result.pathData,
        width: result.width,
        height: result.height,
    };
}
