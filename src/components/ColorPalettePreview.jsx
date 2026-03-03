import React, { useState } from 'react';

// Using the mock DB from App.jsx so we can visualize them
const FILMS = [
    { id: 'f1', name: '솔리드 레드', color: '#ef4444', pricePer500: 5000 },
    { id: 'f2', name: '솔리드 블루', color: '#3b82f6', pricePer500: 5000 },
    { id: 'f3', name: '매트 블랙', color: '#1f2937', pricePer500: 6000 },
    { id: 'f4', name: '화이트 유광', color: '#f8fafc', pricePer500: 4500 },
    { id: 'f5', name: '우드 패턴(브라운)', color: '#854d0e', pricePer500: 7000 },
];

// Replicating the logic from the Canvas
const getInactiveColor = (color) => {
    // Canvas logic: <Group><Rect fill={color}/><Rect fill="#000000" opacity={0.2}/></Group>
    // This is equivalent to darkening the color by alpha blending it with black.
    // Let's use CSS custom properties or inline styles to represent this accurately in DOM.
    return color; // The 0.2 black overlay will be a separate DOM node for accuracy
};

const getActiveColor = (color) => {
    return color; // The 0.2 white+color overlay mix is done with nodes
};


const ColorPalettePreview = ({ onClose }) => {
    return (
        <div className="palette-preview-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, overflowY: 'auto',
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px'
        }}>
            <div className="palette-preview-container" style={{
                backgroundColor: '#fff', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '800px',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2>컬러 톤(Tone) 매칭 테스트 보드</h2>
                    <button onClick={onClose} style={{ padding: '8px 16px', cursor: 'pointer', background: '#e2e8f0', border: 'none', borderRadius: '4px' }}>닫기</button>
                </div>

                <p style={{ marginBottom: '24px', color: '#64748b' }}>현재 캔버스에 적용된 3가지 색상 계층(대기 시트, 작업 시트, 도형)이 각 필름 모델별로 어떻게 보이는지 한눈에 테스트합니다.</p>

                <div className="palette-grid" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                    {FILMS.map(film => (
                        <div key={film.id} className="palette-row" style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>

                            {/* 1. Inactive Sheet (Background) */}
                            <div className="swatch inactive-state" style={{ flex: 1, padding: '20px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '120px' }}>
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: '#ffffff' }}></div>
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: film.color, opacity: 0.6 }}></div>
                                <div style={{ position: 'relative', zIndex: 1, color: '#1e293b', fontWeight: 'bold' }}>대기 시트</div>
                                <div style={{ position: 'relative', zIndex: 1, color: '#475569', fontSize: '0.85em', marginTop: '4px' }}>White + 오리지널(60%)</div>
                            </div>

                            {/* 2. Active Sheet (Working Area) */}
                            <div className="swatch active-state" style={{ flex: 1, padding: '20px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: '#ffffff' }}></div>
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: film.color, opacity: 0.2 }}></div>
                                <div style={{ position: 'relative', zIndex: 1, color: '#1e293b', fontWeight: 'bold' }}>작업 시트</div>
                                <div style={{ position: 'relative', zIndex: 1, color: '#475569', fontSize: '0.85em', marginTop: '4px' }}>White + 오리지널(20%)</div>
                            </div>

                            {/* 3. Shape (Original Solid) */}
                            <div className="swatch shape-state" style={{ flex: 1, padding: '20px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }}>
                                <div style={{
                                    width: '60px', height: '60px', borderRadius: '50%',
                                    backgroundColor: film.color,
                                    border: '2px solid white',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                                }}></div>
                                <div style={{ position: 'relative', zIndex: 1, color: '#1e293b', fontWeight: 'bold', marginTop: '12px' }}>그려진 도형</div>
                                <div style={{ position: 'relative', zIndex: 1, color: '#475569', fontSize: '0.85em', marginTop: '4px' }}>오리지널 100%</div>
                            </div>

                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ColorPalettePreview;
