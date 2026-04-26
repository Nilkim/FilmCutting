import { useEffect, useState } from 'react';
import './ShapeDimensionsPanel.css';

// Side panel shown when a shape is selected. Lets the user numerically
// control the shape's displayed width/height (mm) and rotation (°).
//
// Width/height work via *visual scale*: the underlying pathData stays the
// same, but `scaleX = newW / shape.width` (and similarly for Y) so the
// shape stretches to the requested size. This matches the A1 decision —
// no expensive pathData regeneration on each edit.
//
// Inputs are committed on blur or Enter; rotation also commits on each
// number step click. We hold raw text in local state so users can type
// freely (including transient empty/decimal-in-progress values).
export default function ShapeDimensionsPanel({ shape, onChange }) {
    const displayedW = shape ? (shape.width || 0) * (shape.scaleX || 1) : 0;
    const displayedH = shape ? (shape.height || 0) * (shape.scaleY || 1) : 0;
    const rotation = shape ? Math.round(((shape.rotation || 0) % 360 + 360) % 360) : 0;

    // Local string state for inputs — synced to the shape when it changes
    // externally (selection swap, transformer drag end, undo/redo).
    const [wRaw, setWRaw] = useState('');
    const [hRaw, setHRaw] = useState('');
    const [rRaw, setRRaw] = useState('');

    useEffect(() => {
        setWRaw(displayedW.toFixed(0));
        setHRaw(displayedH.toFixed(0));
        setRRaw(String(rotation));
    }, [shape?.id, displayedW, displayedH, rotation]);

    if (!shape) return null;
    if (!shape.width || !shape.height) {
        // Legacy shapes (DXF imports, old saved orders) without explicit
        // width/height bake — we can't compute scale-based resize for these.
        return (
            <div className="dim-panel">
                <div className="dim-panel-title">선택 도형</div>
                <div className="dim-panel-hint">
                    이 도형은 가로/세로 직접 편집을 지원하지 않아요.
                    <br />캔버스의 핸들로 조절해 주세요.
                </div>
            </div>
        );
    }

    const commitWidth = () => {
        const v = Number(wRaw);
        if (!isFinite(v) || v <= 0) {
            setWRaw(displayedW.toFixed(0));
            return;
        }
        onChange({ scaleX: v / shape.width });
    };
    const commitHeight = () => {
        const v = Number(hRaw);
        if (!isFinite(v) || v <= 0) {
            setHRaw(displayedH.toFixed(0));
            return;
        }
        onChange({ scaleY: v / shape.height });
    };
    const commitRotation = () => {
        const v = Number(rRaw);
        if (!isFinite(v)) {
            setRRaw(String(rotation));
            return;
        }
        onChange({ rotation: v });
    };

    const onKeyDown = (commit) => (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.target.blur(); // triggers onBlur → commit
        }
    };

    return (
        <div className="dim-panel">
            <div className="dim-panel-title">선택된 도형</div>
            <div className="dim-row">
                <label>가로 (mm)</label>
                <input
                    type="number"
                    min="1"
                    step="1"
                    value={wRaw}
                    onChange={(e) => setWRaw(e.target.value)}
                    onBlur={commitWidth}
                    onKeyDown={onKeyDown(commitWidth)}
                />
            </div>
            <div className="dim-row">
                <label>세로 (mm)</label>
                <input
                    type="number"
                    min="1"
                    step="1"
                    value={hRaw}
                    onChange={(e) => setHRaw(e.target.value)}
                    onBlur={commitHeight}
                    onKeyDown={onKeyDown(commitHeight)}
                />
            </div>
            <div className="dim-row">
                <label>회전 (°)</label>
                <input
                    type="number"
                    step="1"
                    value={rRaw}
                    onChange={(e) => setRRaw(e.target.value)}
                    onBlur={commitRotation}
                    onKeyDown={onKeyDown(commitRotation)}
                />
            </div>
            <div className="dim-panel-hint">
                Enter 또는 입력칸 밖을 클릭하면 적용돼요.
            </div>
        </div>
    );
}
