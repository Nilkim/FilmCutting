import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clampFillet,
  generateRectPath,
  generateCirclePath,
  generateTrianglePath,
  generateStarPath,
  generateBubblePath,
  generateTextPath,
} from '../utils/shapeGenerators';
import { loadFont, findMissingGlyphs } from '../utils/fontLoader';
import './ShapeInputModal.css';

// IME-safe text input. Uses uncontrolled DOM during composition (defaultValue
// + useEffect sync) so the Korean IME buffer is never clobbered by React's
// controlled-input reconciliation mid-composition. Committed value is pushed
// up via onChange on input (non-composing) or on compositionend.
function CompositionSafeInput({ value, onChange, ...rest }) {
  const ref = useRef(null);
  const composingRef = useRef(false);

  // Sync DOM to external `value` only when not composing. This lets parents
  // still "set" the value programmatically (e.g. re-opening in edit mode).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (composingRef.current) return;
    const v = value ?? '';
    if (el.value !== v) el.value = v;
  }, [value]);

  return (
    <input
      ref={ref}
      defaultValue={value ?? ''}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        onChange(e.target.value);
      }}
      onInput={(e) => {
        if (composingRef.current) return;
        onChange(e.target.value);
      }}
      {...rest}
    />
  );
}

const KIND_LABELS = {
  rect: '사각형',
  circle: '원/타원',
  triangle: '삼각형',
  star: '별',
  bubble: '말풍선',
  text: '텍스트',
};

const DEFAULT_PARAMS = {
  rect: { width: 100, height: 100, fillet: 0 },
  circle: { width: 100, height: 100 },
  triangle: { width: 100, height: 100, fillet: 0 },
  star: {
    width: 100,
    height: 100,
    points: 5,
    innerRatio: 0.5,
    fillet: 0,
  },
  bubble: {
    width: 120,
    height: 80,
    tailDir: 'down',
    tailSize: 20,
    fillet: 8,
  },
  text: { text: '텍스트', size: 30, weight: 'regular' },
};

// Non-text kinds are synchronous — wrap them so every generator returns a
// Promise and the effect below can treat them uniformly.
function generateForKind(kind, params) {
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
    case 'text':
      return generateTextPath(params);
    default:
      return Promise.reject(new Error(`Unknown shape kind: ${kind}`));
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
  mode = 'modal', // 'modal' (mobile, full overlay) | 'panel' (PC, inline)
}) {
  const isEdit = !!initialParams;
  const isPanel = mode === 'panel';
  const defaults = DEFAULT_PARAMS[kind] || {};

  // Keep raw string values in state for number inputs so typing "12." works.
  const [raw, setRaw] = useState(() => {
    const src = initialParams || defaults;
    const out = {};
    Object.keys(defaults).forEach((k) => {
      const v = src[k] !== undefined ? src[k] : defaults[k];
      // Keep strings as strings; numbers stringified for number inputs
      out[k] = typeof v === 'number' ? String(v) : v;
    });
    if (kind === 'bubble') {
      out.tailDir = (src.tailDir ?? defaults.tailDir) || 'down';
    }
    if (kind === 'text') {
      out.text = src.text ?? defaults.text;
      out.weight = src.weight ?? defaults.weight;
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
    } else if (kind === 'circle') {
      p.width = toNum(raw.width, 0);
      p.height = toNum(raw.height, 0);
    } else if (kind === 'star') {
      p.width = toNum(raw.width, 0);
      p.height = toNum(raw.height, 0);
      p.points = Math.max(3, Math.min(12, Math.round(toNum(raw.points, 5))));
      p.innerRatio = Math.max(
        0.05,
        Math.min(0.95, toNum(raw.innerRatio, 0.5))
      );
      p.fillet = toNum(raw.fillet, 0);
    } else if (kind === 'bubble') {
      p.width = toNum(raw.width, 0);
      p.height = toNum(raw.height, 0);
      p.tailDir = raw.tailDir || 'down';
      p.tailSize = toNum(raw.tailSize, 0);
      p.fillet = toNum(raw.fillet, 0);
    } else if (kind === 'text') {
      p.text = String(raw.text ?? '');
      p.size = toNum(raw.size, 0);
      p.weight = raw.weight === 'bold' ? 'bold' : 'regular';
    }
    return p;
  }, [kind, raw]);

  // Clamp fillet automatically (only meaningful for kinds that have it)
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
    if (kind !== 'text') {
      needsPositive('width', '폭');
      needsPositive('height', '높이');
    }
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
    if (kind === 'text') {
      if (!finalParams.text || !finalParams.text.trim()) e.text = '텍스트를 입력해 주세요';
      if (!(finalParams.size > 0)) e.size = '글자 크기는 0보다 커야 합니다';
    }
    return e;
  }, [kind, finalParams]);

  // Async-aware generation.
  // For non-text shapes the Promise resolves in the same microtask so no
  // flash of loading state. For text we may briefly wait on the font fetch.
  const [generated, setGenerated] = useState(null);
  const [genError, setGenError] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const latestRequestRef = useRef(0);

  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      setGenerated(null);
      setGenError(null);
      setIsGenerating(false);
      return;
    }
    const requestId = ++latestRequestRef.current;
    setIsGenerating(kind === 'text'); // only text can actually be slow
    generateForKind(kind, finalParams)
      .then((g) => {
        if (latestRequestRef.current !== requestId) return; // stale
        setGenerated(g);
        setGenError(null);
        setIsGenerating(false);
      })
      .catch((err) => {
        if (latestRequestRef.current !== requestId) return;
        setGenerated(null);
        setGenError(err);
        setIsGenerating(false);
      });
  }, [kind, finalParams, errors]);

  // Missing-glyph detection for text (only runs when text is non-empty).
  const [missingGlyphs, setMissingGlyphs] = useState([]);
  useEffect(() => {
    if (kind !== 'text' || !finalParams.text || !finalParams.text.trim()) {
      setMissingGlyphs([]);
      return;
    }
    let cancelled = false;
    loadFont(finalParams.weight)
      .then((font) => {
        if (cancelled) return;
        setMissingGlyphs(findMissingGlyphs(font, finalParams.text));
      })
      .catch(() => {
        if (cancelled) return;
        setMissingGlyphs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, finalParams.text, finalParams.weight]);

  const canConfirm =
    !genError &&
    generated &&
    !isGenerating &&
    Object.keys(errors).length === 0;

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
  const pad = 10;
  const vbW = generated ? generated.width + pad * 2 : 100;
  const vbH = generated ? generated.height + pad * 2 : 100;
  const vbX = -vbW / 2;
  const vbY = -vbH / 2;

  const header = isEdit
    ? '도형 수정'
    : `도형 추가 - ${KIND_LABELS[kind] || ''}`;

  const stopProp = (e) => e.stopPropagation();

  // ---- Body composition ----
  // Form fields are identical between modal and panel modes; the wrapper
  // element + preview visibility differ. By assembling Form/Preview/Footer
  // pieces here we avoid duplicating the per-kind input switch.
  const formFields = (
    <div className="shape-modal-form">
            {/* Text-only fields */}
            {kind === 'text' && (
              <>
                <div className="form-row">
                  <label>텍스트</label>
                  <CompositionSafeInput
                    type="text"
                    value={raw.text}
                    onChange={(v) => setField('text', v)}
                    maxLength={60}
                    placeholder="입력할 글자"
                  />
                  {errors.text && <div className="field-error">{errors.text}</div>}
                </div>
                <div className="form-row">
                  <label>글자 크기(mm)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={raw.size}
                    onChange={(e) => setField('size', e.target.value)}
                  />
                  {errors.size && <div className="field-error">{errors.size}</div>}
                </div>
                <div className="form-row">
                  <label>굵기</label>
                  <select
                    value={raw.weight}
                    onChange={(e) => setField('weight', e.target.value)}
                  >
                    <option value="regular">보통 (Regular)</option>
                    <option value="bold">굵게 (Bold)</option>
                  </select>
                </div>
                {missingGlyphs.length > 0 && (
                  <div className="field-warning">
                    ⚠ 이 폰트에 없는 글자: {missingGlyphs.join(' ')}
                    <div className="field-hint">
                      해당 글자는 빈 사각형으로 커팅될 수 있어요. 다른 글자로
                      바꾸거나 빼 주세요.
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Width / Height (non-text kinds) */}
            {kind !== 'text' && (
              <>
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
              </>
            )}

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

            {/* Fillet (all except circle and text) */}
            {kind !== 'circle' && kind !== 'text' && (
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

    </div>
  );

  const previewBlock = (
    <div className="shape-modal-preview">
      <div className="preview-title">미리보기</div>
      <div className="preview-box">
        {isGenerating ? (
          <div className="preview-empty">폰트 불러오는 중...</div>
        ) : genError ? (
          <div className="preview-error">도형 생성 실패</div>
        ) : generated ? (
          <svg
            viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
            preserveAspectRatio="xMidYMid meet"
            width="100%"
            height="100%"
          >
            <path
              d={generated.pathData}
              fill="#e0e7ff"
              fillRule="evenodd"
              stroke="#1e40af"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
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
  );

  const footer = (
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
  );

  // ---- Panel mode (PC, embedded in right column) ----
  // No backdrop, no preview SVG (canvas shows live), narrower layout.
  if (isPanel) {
    return (
      <div className="shape-panel">
        <div className="shape-panel-header">
          <h3>{header}</h3>
          <button
            type="button"
            className="shape-panel-close"
            onClick={onCancel}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="shape-panel-body">{formFields}</div>
        {footer}
      </div>
    );
  }

  // ---- Modal mode (mobile/legacy) ----
  return (
    <div className="shape-modal-backdrop">
      <div className="shape-modal" onClick={stopProp}>
        <div className="shape-modal-header">
          <h2>{header}</h2>
        </div>
        <div className="shape-modal-body">
          {formFields}
          {previewBlock}
        </div>
        {footer}
      </div>
    </div>
  );
}
