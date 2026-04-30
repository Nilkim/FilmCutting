import { useEffect, useRef, useState } from 'react';
import opentype from 'opentype.js';
import {
    KIND_LABELS,
    generateForKind,
} from '../utils/shapeRegistry';
import {
    loadFont,
    findMissingGlyphs,
    CURATED_FONTS,
    DEFAULT_FONT_ID,
} from '../utils/fontLoader';
import { isCuratedFont } from '../utils/fontRegistry';
import {
    listCustomFonts,
    putCustomFont,
} from '../utils/customFontStore';
import { clampFillet } from '../utils/shapeGenerators';
import './ShapeSpecEditor.css';

const MAX_FONT_BYTES = 50 * 1024 * 1024; // 50MB cap to avoid OOM on huge files

// IME-safe text input (uncontrolled DOM during composition).
// Same pattern as the one originally in ShapeInputModal — Korean IME
// composition would otherwise be canceled by React's controlled-input
// reconciliation when parent re-renders mid-compose.
function CompositionSafeInput({ value, onChange, ...rest }) {
    const ref = useRef(null);
    const composingRef = useRef(false);

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
            onCompositionStart={() => { composingRef.current = true; }}
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

// Spec editor — shown in the side panel for the currently-selected shape.
// Two sections:
//   1) Kind form (only when shape.kind/params exist — i.e. parametric shape
//      that hasn't been merged/subtracted into a free path). Editing here
//      regenerates pathData live and pushes a full shape update upstream.
//   2) Transform — always present. Width/height/rotation in mm/°. Width
//      and height adjust scaleX/scaleY relative to the underlying base
//      width/height (visual scale, A1 model). Rotation directly sets
//      shape.rotation.
//
// Inputs use uncontrolled DOM (defaultValue, re-keyed on shape.id) and
// commit on blur or Enter to keep typing responsive without clobbering
// half-typed values when shape props change from canvas drag.
export default function ShapeSpecEditor({ shape, onUpdate, onDelete, onDuplicate }) {
    if (!shape) return null;

    const hasKind = shape.kind && shape.params;
    const hasActions = onDelete || onDuplicate;

    return (
        <div className="spec-editor">
            <div className="spec-editor-title">선택된 도형</div>
            {hasKind && <KindForm shape={shape} onUpdate={onUpdate} />}
            <TransformSection shape={shape} onUpdate={onUpdate} />
            {hasActions && (
                <div className="spec-action-row">
                    {onDuplicate && (
                        <button
                            type="button"
                            className="spec-duplicate-btn"
                            onClick={onDuplicate}
                        >
                            📄 복사
                        </button>
                    )}
                    {onDelete && (
                        <button
                            type="button"
                            className="spec-delete-btn"
                            onClick={onDelete}
                        >
                            🗑 삭제
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ------------------------------------------------------------------
// Kind-specific form (per-kind extras only — no width/height here;
// those live in Transform so the user has one consistent place to
// resize regardless of whether the shape is parametric or post-boolean).
// ------------------------------------------------------------------
function KindForm({ shape, onUpdate }) {
    const { kind, params } = shape;

    // Async-regenerate when params change. Race-protected.
    const latestRequestRef = useRef(0);
    const regenerate = (newParams) => {
        const requestId = ++latestRequestRef.current;
        generateForKind(kind, newParams)
            .then((g) => {
                if (latestRequestRef.current !== requestId) return;
                onUpdate({
                    params: newParams,
                    pathData: g.pathData,
                    width: g.width,
                    height: g.height,
                });
            })
            .catch(() => {
                // Ignore — keeps previous shape if generation fails (e.g.
                // empty text). UI shows the current state.
            });
    };

    const updateParam = (key, value) => {
        regenerate({ ...params, [key]: value });
    };

    // 정필렛 reset: 비균일 scale을 base에 굽고 scaleX/scaleY를 1로 리셋.
    // 새 base에서 path가 재생성되므로 fillet/곡선 등 원형 요소가 정원형으로
    // 복원됨. fillet 값(mm)은 그대로 — 사용자가 입력한 절대 mm를 컷팅
    // 정확도 위해 보존(사용자 결정).
    //
    // **시각 크기 보존을 위한 inset 보정**:
    // 사각형은 path bounds = params.width × params.height라 단순히
    // newParams.width = shape.width * scaleX로 충분. 하지만 삼각형/별의
    // buildFilletedPolygon은 vertex 안쪽으로 fillet을 굽혀 path bounds가
    // params보다 작아짐(shape.width < params.width). 이 비율을 유지하지
    // 않으면 bake할 때마다 시각 크기가 줄어드는 압축 효과 발생.
    // 해결: 현재 ratio(shape.width / params.width)를 새 params에도 적용해
    // generator가 큰 입력을 받고 inset 후에도 visualW에 가깝게 출력하도록.
    const bakeScaleIntoBase = () => {
        const sx = shape.scaleX || 1;
        const sy = shape.scaleY || 1;
        if (sx === 1 && sy === 1) return; // no-op
        const visualW = (shape.width || 0) * sx;
        const visualH = (shape.height || 0) * sy;
        const ratioW = (shape.width && params.width) ? shape.width / params.width : 1;
        const ratioH = (shape.height && params.height) ? shape.height / params.height : 1;
        const newParams = {
            ...params,
            width: ratioW > 0 ? visualW / ratioW : visualW,
            height: ratioH > 0 ? visualH / ratioH : visualH,
        };
        const requestId = ++latestRequestRef.current;
        generateForKind(kind, newParams)
            .then((g) => {
                if (latestRequestRef.current !== requestId) return;
                onUpdate({
                    params: newParams,
                    pathData: g.pathData,
                    width: g.width,
                    height: g.height,
                    scaleX: 1,
                    scaleY: 1,
                });
            })
            .catch(() => {});
    };

    // ↺를 둘러싼 동작이 비균일 scale 존재 시에만 의미 있음 — 그 외엔
    // 버튼 시각적으로 dim 처리하지만 클릭은 no-op이라 안전.
    const canBake = (shape.scaleX || 1) !== 1 || (shape.scaleY || 1) !== 1;

    // Missing glyphs detection (text only). Re-runs whenever font, weight,
    // or text changes so the warning stays accurate as the user swaps fonts.
    const [missingGlyphs, setMissingGlyphs] = useState([]);
    useEffect(() => {
        if (kind !== 'text' || !params.text || !params.text.trim()) {
            setMissingGlyphs([]);
            return;
        }
        let cancelled = false;
        loadFont(params.fontId, params.weight)
            .then((font) => {
                if (cancelled) return;
                setMissingGlyphs(findMissingGlyphs(font, params.text));
            })
            .catch(() => { if (!cancelled) setMissingGlyphs([]); });
        return () => { cancelled = true; };
    }, [kind, params.text, params.fontId, params.weight]);

    return (
        <div className="spec-section">
            <div className="spec-section-title">{KIND_LABELS[kind]}</div>

            {kind === 'text' && (
                <TextKindFields
                    params={params}
                    onUpdate={updateParam}
                    missingGlyphs={missingGlyphs}
                />
            )}
            {(kind === 'rect' || kind === 'triangle') && (
                <FilletField
                    params={params}
                    onUpdate={updateParam}
                    onResetFillet={canBake ? bakeScaleIntoBase : null}
                />
            )}
            {kind === 'star' && (
                <StarFields
                    params={params}
                    onUpdate={updateParam}
                    onResetFillet={canBake ? bakeScaleIntoBase : null}
                />
            )}
            {kind === 'bubble' && (
                <BubbleFields
                    params={params}
                    onUpdate={updateParam}
                    onResetFillet={canBake ? bakeScaleIntoBase : null}
                />
            )}
            {kind === 'arch' && (
                <ArchFields
                    params={params}
                    onUpdate={updateParam}
                    scaleX={shape.scaleX || 1}
                    scaleY={shape.scaleY || 1}
                    baseWidth={shape.width || params.width}
                    onResetFillet={canBake ? bakeScaleIntoBase : null}
                />
            )}
            {/* circle has no extras */}
        </div>
    );
}

function TextKindFields({ params, onUpdate, missingGlyphs }) {
    // Custom fonts are loaded once on mount and refreshed after every
    // upload. Curated fonts are static so they only need to be merged
    // into the dropdown options at render time.
    const [customFonts, setCustomFonts] = useState([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        listCustomFonts()
            .then(setCustomFonts)
            .catch(() => setCustomFonts([]));
    }, []);

    const fontId = params.fontId || DEFAULT_FONT_ID;
    const isCustom = !isCuratedFont(fontId);

    const handleFileSelected = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow same file re-selection later
        if (!file) return;

        if (file.size > MAX_FONT_BYTES) {
            alert(`폰트 파일이 너무 큽니다 (최대 50MB). 현재: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
            return;
        }

        setUploading(true);
        try {
            const buf = await file.arrayBuffer();
            // opentype.parse throws on unsupported formats (woff2, malformed, etc.)
            let font;
            try {
                font = opentype.parse(buf);
            } catch {
                alert('지원하지 않는 폰트 파일입니다. TTF 또는 OTF만 사용해 주세요.');
                return;
            }
            // Pick the best human-readable label opentype has
            const names = font.names || {};
            const pickName = (n) => n?.en || n?.ko || n?.['ko-KR'] || Object.values(n || {})[0];
            const label =
                pickName(names.fullName)
                || pickName(names.fontFamily)
                || file.name.replace(/\.(ttf|otf)$/i, '');

            const id = `custom-${(crypto.randomUUID?.() || Date.now() + '-' + Math.random())}`;
            await putCustomFont({ id, label, blob: new Blob([buf]) });

            setCustomFonts((prev) => [...prev, { id, label }]);
            // Auto-select the freshly uploaded font.
            onUpdate('fontId', id);
        } finally {
            setUploading(false);
        }
    };

    return (
        <>
            <div className="spec-row">
                <label>텍스트</label>
                <CompositionSafeInput
                    type="text"
                    value={params.text}
                    onChange={(v) => onUpdate('text', v)}
                    maxLength={60}
                    placeholder="입력할 글자"
                />
            </div>
            <NumberRow
                label="글자 크기 (mm)"
                value={params.size}
                min={1}
                onCommit={(v) => onUpdate('size', v)}
            />
            <div className="spec-row">
                <label>폰트</label>
                <select
                    value={fontId}
                    onChange={(e) => onUpdate('fontId', e.target.value)}
                >
                    <optgroup label="기본 폰트">
                        {CURATED_FONTS.map((f) => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                        ))}
                    </optgroup>
                    {customFonts.length > 0 && (
                        <optgroup label="내가 추가한 폰트">
                            {customFonts.map((f) => (
                                <option key={f.id} value={f.id}>{f.label}</option>
                            ))}
                        </optgroup>
                    )}
                </select>
            </div>
            <div className="spec-row">
                <label>굵기</label>
                <select
                    value={params.weight}
                    onChange={(e) => onUpdate('weight', e.target.value)}
                    disabled={isCustom}
                    title={isCustom ? '업로드한 폰트는 단일 굵기만 지원합니다' : undefined}
                >
                    <option value="regular">보통 (Regular)</option>
                    <option value="bold">굵게 (Bold)</option>
                </select>
            </div>
            <div className="spec-row spec-row-actions">
                <span />
                <button
                    type="button"
                    className="font-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                >
                    {uploading ? '추가 중...' : '📁 폰트 파일 추가 (TTF/OTF)'}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ttf,.otf"
                    style={{ display: 'none' }}
                    onChange={handleFileSelected}
                />
            </div>
            <div className="font-license-note">
                ⚠ 본인이 사용 권리가 있는 폰트만 업로드해 주세요.
            </div>
            {missingGlyphs.length > 0 && (
                <div className="spec-warning">
                    ⚠ 이 폰트에 없는 글자: {missingGlyphs.join(' ')}
                    <div className="spec-warning-hint">
                        해당 글자는 빈 사각형으로 커팅될 수 있어요. 다른 폰트를
                        선택하거나 글자를 바꿔 주세요.
                    </div>
                </div>
            )}
        </>
    );
}

// 정필렛 reset 버튼 — fillet이 있는 모든 도형에서 공유.
// 클릭 시 비균일 scale을 base에 굽고 scaleX/scaleY를 1로 리셋해 fillet이
// 정원형으로 복원됨. onResetFillet이 null/undefined면 렌더 안 함(scale이
// 모두 1인 상태 = 베이크 의미 없음).
function FilletResetButton({ onClick }) {
    return (
        <button
            type="button"
            className="arch-reset-btn"
            onClick={onClick}
            title="정필렛 — 비균일 scale을 base에 굽고 정원형 fillet 복원"
            aria-label="정필렛으로 맞추기"
        >
            ↺
        </button>
    );
}

function FilletField({ params, onUpdate, onResetFillet }) {
    return (
        <NumberRow
            label="필렛 (mm)"
            value={params.fillet}
            min={0}
            onCommit={(v) => {
                const clamped = clampFillet(v, params.width, params.height);
                onUpdate('fillet', clamped);
            }}
            prefix={onResetFillet ? <FilletResetButton onClick={onResetFillet} /> : undefined}
        />
    );
}

function StarFields({ params, onUpdate, onResetFillet }) {
    return (
        <>
            <NumberRow
                label="꼭짓점 수"
                value={params.points}
                min={3}
                max={12}
                step={1}
                onCommit={(v) => {
                    const clamped = Math.max(3, Math.min(12, Math.round(v)));
                    onUpdate('points', clamped);
                }}
            />
            <NumberRow
                label="내부 비율 (0.05~0.95)"
                value={params.innerRatio}
                min={0.05}
                max={0.95}
                step={0.05}
                onCommit={(v) => {
                    const clamped = Math.max(0.05, Math.min(0.95, v));
                    onUpdate('innerRatio', clamped);
                }}
            />
            <NumberRow
                label="필렛 (mm)"
                value={params.fillet}
                min={0}
                onCommit={(v) => onUpdate('fillet', v)}
                prefix={onResetFillet ? <FilletResetButton onClick={onResetFillet} /> : undefined}
            />
        </>
    );
}

function BubbleFields({ params, onUpdate, onResetFillet }) {
    return (
        <>
            <NumberRow
                label="꼬리 각도 (°)"
                value={params.tailAngle ?? 180}
                step={15}
                onCommit={(v) => {
                    // Normalize to [0, 360) before sending up.
                    const norm = ((v % 360) + 360) % 360;
                    onUpdate('tailAngle', norm);
                }}
            />
            <NumberRow
                label="꼬리 크기 (mm)"
                value={params.tailSize}
                min={0}
                onCommit={(v) => onUpdate('tailSize', v)}
            />
            <NumberRow
                label="필렛 (mm)"
                value={params.fillet}
                min={0}
                onCommit={(v) => onUpdate('fillet', v)}
                prefix={onResetFillet ? <FilletResetButton onClick={onResetFillet} /> : undefined}
            />
        </>
    );
}

function ArchFields({ params, onUpdate, scaleX = 1, scaleY = 1, baseWidth = 0, onResetFillet }) {
    // archHeight를 "세로 (mm)"와 동일한 단위(스케일 적용된 시각 mm)로 표시.
    // 사용자가 Transform 섹션에서 세로를 바꾸면 scaleY가 바뀌고, 이 파생값
    // displayedArchHeight도 자동으로 갱신되어 두 값의 비율이 일관되게 보인다.
    // commit 시에는 다시 base 단위로 환산해 저장 — base를 기준으로 path가
    // 재생성되어야 곡선부/본체 비율 계산(반타원 rx=w/2, ry=archHeight)이
    // 정확하기 때문.
    const sx = scaleX > 0 ? scaleX : 1;
    const sy = scaleY > 0 ? scaleY : 1;
    const displayedArchHeight = (params.archHeight || 0) * sy;

    // 정원형 버튼: 시각적 곡선부가 정확한 반원이 되도록 archHeight 재설정.
    //   visual rx = (baseW/2) * scaleX
    //   visual ry = baseArchHeight * scaleY
    //   정원형 ⇔ rx == ry  ⇔  baseArchHeight = (baseW * scaleX) / (2 * scaleY)
    // scaleX === scaleY인 일반 케이스에선 baseW/2로 단순화됨.
    const setSemicircle = () => {
        const newBase = (baseWidth * sx) / (2 * sy);
        onUpdate('archHeight', Math.max(0, newBase));
    };

    return (
        <>
            <NumberRow
                label="곡선 부분 (mm)"
                value={Math.round(displayedArchHeight)}
                min={0}
                onCommit={(v) => {
                    const base = Math.max(0, v / sy);
                    onUpdate('archHeight', base);
                }}
                prefix={
                    <button
                        type="button"
                        className="arch-reset-btn"
                        onClick={setSemicircle}
                        title="정원형 아치 (가로폭의 절반)"
                        aria-label="정원형으로 맞추기"
                    >
                        ↺
                    </button>
                }
            />
            <NumberRow
                label="필렛 (mm)"
                value={params.fillet}
                min={0}
                onCommit={(v) => onUpdate('fillet', v)}
                prefix={onResetFillet ? <FilletResetButton onClick={onResetFillet} /> : undefined}
            />
        </>
    );
}

// ------------------------------------------------------------------
// Transform section (always shown). Operates on visual scale (A1).
// ------------------------------------------------------------------
function TransformSection({ shape, onUpdate }) {
    const baseW = shape.width || 0;
    const baseH = shape.height || 0;
    const displayedW = baseW * (shape.scaleX || 1);
    const displayedH = baseH * (shape.scaleY || 1);
    const rotation = ((shape.rotation || 0) % 360 + 360) % 360;

    const canResize = baseW > 0 && baseH > 0;

    return (
        <div className="spec-section">
            <div className="spec-section-title">크기·회전</div>
            {canResize ? (
                <>
                    <NumberRow
                        label="가로 (mm)"
                        value={Math.round(displayedW)}
                        min={1}
                        onCommit={(v) => {
                            if (!(v > 0)) return;
                            onUpdate({ scaleX: v / baseW });
                        }}
                    />
                    <NumberRow
                        label="세로 (mm)"
                        value={Math.round(displayedH)}
                        min={1}
                        onCommit={(v) => {
                            if (!(v > 0)) return;
                            onUpdate({ scaleY: v / baseH });
                        }}
                    />
                </>
            ) : (
                <div className="spec-section-hint">
                    이 도형은 가로/세로 직접 입력을 지원하지 않아요.
                    캔버스의 핸들로 조절해 주세요.
                </div>
            )}
            <NumberRow
                label="회전 (°)"
                value={Math.round(rotation)}
                step={1}
                onCommit={(v) => onUpdate({ rotation: v })}
            />
        </div>
    );
}

// ------------------------------------------------------------------
// Number input that live-commits on every keystroke. Controlled by local
// `raw` state so partial inputs (like an empty field mid-typing) don't
// jump or reset. External `value` prop only re-syncs when the field is
// not currently focused — this lets canvas-side changes (e.g. drag-resize)
// flow into the editor while the user isn't actively editing, without
// clobbering an in-progress edit.
//
// Validation: invalid values (NaN, empty) are tolerated as transient state
// — the parent's `onCommit` is still called only with finite numbers, and
// each parent guards its own min/max constraints (e.g. width > 0). The
// shape stays at its last valid state until a valid number arrives.
// ------------------------------------------------------------------
function NumberRow({ label, value, min, max, step = 1, onCommit, prefix }) {
    const [raw, setRaw] = useState(String(value));
    const focusedRef = useRef(false);

    // External value changes (canvas drag, undo/redo, kind-form regen)
    // sync into the input only when the user isn't typing. If they are,
    // their input wins until they blur.
    useEffect(() => {
        if (focusedRef.current) return;
        setRaw(String(value));
    }, [value]);

    const inputEl = (
        <input
            type="number"
            value={raw}
            min={min}
            max={max}
            step={step}
            onFocus={() => { focusedRef.current = true; }}
            onBlur={() => {
                focusedRef.current = false;
                // Resync to whatever the canonical value is now (parent
                // may have clamped/rounded the last commit).
                setRaw(String(value));
            }}
            onChange={(e) => {
                setRaw(e.target.value);
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onCommit(v);
            }}
        />
    );

    return (
        <div className="spec-row">
            <label>{label}</label>
            {prefix ? (
                <div className="spec-row-input-group">
                    {prefix}
                    {inputEl}
                </div>
            ) : (
                inputEl
            )}
        </div>
    );
}
