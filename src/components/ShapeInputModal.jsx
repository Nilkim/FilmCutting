import { useEffect, useMemo, useState } from 'react';
import {
  clampFillet,
  generateRectPath,
  generateCirclePath,
  generateTrianglePath,
  generateStarPath,
  generateBubblePath,
} from '../utils/shapeGenerators';
import './ShapeInputModal.css';

const KIND_LABELS = {
  rect: '사각형',
  circle: '원/타원',
  triangle: '삼각형',
  star: '별',
  bubble: '말풍선',
};

const DEFAULT_PARAMS = {
  rect: { width: 100, height: 100, fillet: 0, rotation: 0 },
  circle: { width: 100, height: 100, rotation: 0 },
  triangle: { width: 100, height: 100, fillet: 0, rotation: 0 },
  star: {
    width: 100,
    height: 100,
    points: 5,
    innerRatio: 0.5,
    fillet: 0,
    rotation: 0,
  },
  bubble: {
    width: 120,
    height: 80,
    tailDir: 'down',
    tailSize: 20,
    fillet: 8,
    rotation: 0,
  },
};

function generateForKind(kind, params) {
  switch (kind) {
    case 'rect':
      return generateRectPath(params);
    case 'circle':
      return generateCirclePath(params);
    case 'triangle':
      return generateTrianglePath(params);
    case 'star':
      return generateStarPath(params);
    case 'bubble':
      return generateBubblePath(params);
    default:
      throw new Error(`Unknown shape kind: ${kind}`);
  }
}

// Converts a raw string input into a number (or keeps string while typing).
// We store string values in state so the user can type freely; we parse on use.
function toNum(v, fallback = 0) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

export default function ShapeInputModal({
  kind,
  initialParams,
  onConfirm,
  onCancel,
}) {
  const isEdit = !!initialParams;
  const defaults = DEFAULT_PARAMS[kind] || {};

  // Keep raw string values in state for number inputs so typing "12." works.
  const [raw, setRaw] = useState(() => {
    const src = initialParams || defaults;
    const out = {};
    Object.keys(defaults).forEach((k) => {
      out[k] = src[k] !== undefined ? String(src[k]) : String(defaults[k]);
    });
    // non-numeric fields (bubble.tailDir) retained as-is
    if (kind === 'bubble') {
      out.tailDir = (src.tailDir ?? defaults.tailDir) || 'down';
    }
    return out;
  });

  const setField = (k, v) => setRaw((prev) => ({ ...prev, [k]: v }));

  // Esc key closes
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  // Parsed numeric params (after per-kind validation)
  const parsed = useMemo(() => {
    const p = {};
    if (kind === 'rect' || kind === 'triangle') {
      p.width = toNum(raw.width, 0);
      p.height = toNum(raw.height, 0);
      p.fillet = toNum(raw.fillet, 0);
      p.rotation = toNum(raw.rotation, 0);
    } else if (kind === 'circle') {
      p.width = toNum(raw.width, 0);
      p.height = toNum(raw.height, 0);
      p.rotation = toNum(raw.rotation, 0);
    } else if (kind === 'star') {
      p.width = toNum(raw.width, 0);
      p.height = toNum(raw.height, 0);
      p.points = Math.max(3, Math.min(12, Math.round(toNum(raw.points, 5))));
      p.innerRatio = Math.max(
        0.05,
        Math.min(0.95, toNum(raw.innerRatio, 0.5))
      );
      p.fillet = toNum(raw.fillet, 0);
      p.rotation = toNum(raw.rotation, 0);
    } else if (kind === 'bubble') {
      p.width = toNum(raw.width, 0);
      p.height = toNum(raw.height, 0);
      p.tailDir = raw.tailDir || 'down';
      p.tailSize = toNum(raw.tailSize, 0);
      p.fillet = toNum(raw.fillet, 0);
      p.rotation = toNum(raw.rotation, 0);
    }
    return p;
  }, [kind, raw]);

  // Clamp fillet automatically
  const maxFillet = useMemo(() => {
    const w = parsed.width || 0;
    const h = parsed.height || 0;
    return Math.min(Math.abs(w), Math.abs(h)) / 2;
  }, [parsed.width, parsed.height]);

  const filletClamped =
    'fillet' in parsed ? clampFillet(parsed.fillet, parsed.width, parsed.height) : 0;
  const filletWasClamped =
    'fillet' in parsed &&
    parsed.fillet > 0 &&
    filletClamped < parsed.fillet - 1e-9;

  // Final params object used for generation / onConfirm
  const finalParams = useMemo(() => {
    const p = { ...parsed };
    if ('fillet' in p) p.fillet = filletClamped;
    return p;
  }, [parsed, filletClamped]);

  // Validation
  const errors = useMemo(() => {
    const e = {};
    const needsPositive = (field, label) => {
      const v = finalParams[field];
      if (!(v > 0)) e[field] = `${label}은(는) 0보다 커야 합니다`;
    };
    needsPositive('width', '폭');
    needsPositive('height', '높이');
    if (kind === 'star') {
      const p = finalParams.points;
      if (!(p >= 3 && p <= 12)) e.points = '꼭짓점 수는 3~12 사이여야 합니다';
      const ir = finalParams.innerRatio;
      if (!(ir >= 0.05 && ir <= 0.95))
        e.innerRatio = '내부 비율은 0.05~0.95 사이여야 합니다';
    }
    if (kind === 'bubble') {
      if (!(finalParams.tailSize > 0)) e.tailSize = '꼬리 크기는 0보다 커야 합니다';
    }
    const rot = finalParams.rotation;
    if (rot < -360 || rot > 360) e.rotation = '회전은 -360 ~ 360 사이여야 합니다';
    return e;
  }, [kind, finalParams]);

  // Generate path
  const [generated, genError] = useMemo(() => {
    if (Object.keys(errors).length > 0) return [null, null];
    try {
      const g = generateForKind(kind, finalParams);
      return [g, null];
    } catch (err) {
      return [null, err];
    }
  }, [kind, finalParams, errors]);

  const canConfirm = !genError && generated && Object.keys(errors).length === 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm?.({
      kind,
      params: finalParams,
      pathData: generated.pathData,
      width: generated.width,
      height: generated.height,
    });
  };

  // --- Preview SVG viewBox ---
  // Generator returns bounds-accurate width/height (e.g. bubble includes tail).
  // We fit preview around those, centered at (0,0), plus padding for stroke.
  const pad = 10;
  const vbW = generated ? generated.width + pad * 2 : 100;
  const vbH = generated ? generated.height + pad * 2 : 100;
  const vbX = -vbW / 2;
  const vbY = -vbH / 2;

  const header = isEdit
    ? '도형 수정'
    : `도형 추가 - ${KIND_LABELS[kind] || ''}`;

  // Prevent backdrop click from closing (per AdminFilmsPage pattern).
  const stopProp = (e) => e.stopPropagation();

  return (
    <div className="shape-modal-backdrop">
      <div className="shape-modal" onClick={stopProp}>
        <div className="shape-modal-header">
          <h2>{header}</h2>
        </div>

        <div className="shape-modal-body">
          <div className="shape-modal-form">
            {/* Width / Height (all kinds) */}
            <div className="form-row">
              <label>폭(mm)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={raw.width}
                onChange={(e) => setField('width', e.target.value)}
              />
              {errors.width && <div className="field-error">{errors.width}</div>}
            </div>

            <div className="form-row">
              <label>높이(mm)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={raw.height}
                onChange={(e) => setField('height', e.target.value)}
              />
              {errors.height && (
                <div className="field-error">{errors.height}</div>
              )}
            </div>

            {/* Star-only: points + innerRatio */}
            {kind === 'star' && (
              <>
                <div className="form-row">
                  <label>꼭짓점 수</label>
                  <input
                    type="number"
                    min="3"
                    max="12"
                    step="1"
                    value={raw.points}
                    onChange={(e) => setField('points', e.target.value)}
                  />
                  {errors.points && (
                    <div className="field-error">{errors.points}</div>
                  )}
                </div>
                <div className="form-row">
                  <label>내부 비율 (0.05 ~ 0.95)</label>
                  <input
                    type="number"
                    min="0.05"
                    max="0.95"
                    step="0.05"
                    value={raw.innerRatio}
                    onChange={(e) => setField('innerRatio', e.target.value)}
                  />
                  {errors.innerRatio && (
                    <div className="field-error">{errors.innerRatio}</div>
                  )}
                </div>
              </>
            )}

            {/* Bubble-only: tailDir + tailSize */}
            {kind === 'bubble' && (
              <>
                <div className="form-row">
                  <label>꼬리 방향</label>
                  <select
                    value={raw.tailDir}
                    onChange={(e) => setField('tailDir', e.target.value)}
                  >
                    <option value="up">상</option>
                    <option value="down">하</option>
                    <option value="left">좌</option>
                    <option value="right">우</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>꼬리 크기(mm)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={raw.tailSize}
                    onChange={(e) => setField('tailSize', e.target.value)}
                  />
                  {errors.tailSize && (
                    <div className="field-error">{errors.tailSize}</div>
                  )}
                </div>
              </>
            )}

            {/* Fillet (all except circle) */}
            {kind !== 'circle' && (
              <div className="form-row">
                <label>필렛(mm)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={raw.fillet}
                  onChange={(e) => setField('fillet', e.target.value)}
                />
                {filletWasClamped && (
                  <div className="field-hint">
                    필렛이 자동으로 {filletClamped.toFixed(2)}mm로 조정되었습니다
                    (최대 {maxFillet.toFixed(2)}mm)
                  </div>
                )}
              </div>
            )}

            {/* Rotation (all kinds) */}
            <div className="form-row">
              <label>회전(°)</label>
              <input
                type="number"
                min="-360"
                max="360"
                step="1"
                value={raw.rotation}
                onChange={(e) => setField('rotation', e.target.value)}
              />
              {errors.rotation && (
                <div className="field-error">{errors.rotation}</div>
              )}
            </div>
          </div>

          <div className="shape-modal-preview">
            <div className="preview-title">미리보기</div>
            <div className="preview-box">
              {genError ? (
                <div className="preview-error">도형 생성 실패</div>
              ) : generated ? (
                <svg
                  viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
                  preserveAspectRatio="xMidYMid meet"
                  width="100%"
                  height="100%"
                >
                  <g transform={`rotate(${finalParams.rotation || 0})`}>
                    <path
                      d={generated.pathData}
                      fill="#e0e7ff"
                      stroke="#1e40af"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                </svg>
              ) : (
                <div className="preview-empty">값을 입력해 주세요</div>
              )}
            </div>
            {generated && (
              <div className="preview-dims">
                실제 크기: {generated.width.toFixed(1)} ×{' '}
                {generated.height.toFixed(1)} mm
              </div>
            )}
          </div>
        </div>

        <div className="shape-modal-footer">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
