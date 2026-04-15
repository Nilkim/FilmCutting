import React from 'react';
import { Square, Circle, Triangle, Star, MessageSquare, Combine, Scissors, Download, Upload } from 'lucide-react';
import './Sidebar.css';

const TOOLS = [
    { id: 'rect', label: '사각형', icon: <Square size={24} /> },
    { id: 'circle', label: '원형', icon: <Circle size={24} /> },
    { id: 'triangle', label: '삼각형', icon: <Triangle size={24} /> },
    { id: 'star', label: '별표', icon: <Star size={24} /> },
    { id: 'bubble', label: '말풍선', icon: <MessageSquare size={24} /> },
];

const Sidebar = ({ onAddShape, onMergeShapes, onExportDXF, onImportDXF }) => {
    return (
        <aside className="sidebar">
            <div className="sidebar-section">
                <div className="sidebar-title">
                    도형 추가
                </div>
                <div className="tools-grid">
                    {TOOLS.map(tool => (
                        <button
                            key={tool.id}
                            className="tool-btn"
                            onClick={() => onAddShape(tool.id)}
                        >
                            <div className="tool-icon">{tool.icon}</div>
                            <span className="tool-label">{tool.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="sidebar-section" style={{ marginTop: '24px' }}>
                <div className="sidebar-title" style={{ color: '#8b5cf6' }}>
                    도형 편집 (Beta)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                        className="tool-btn action-btn text-xs"
                        style={{ flexDirection: 'row', width: '100%', padding: '12px' }}
                        onClick={() => onMergeShapes('union')}
                    >
                        <Combine size={18} style={{ marginRight: '8px' }} />
                        <span>선택한 도형과 합치기</span>
                    </button>
                    <button
                        className="tool-btn action-btn text-xs"
                        style={{ flexDirection: 'row', width: '100%', padding: '12px' }}
                        onClick={() => onMergeShapes('subtract')}
                    >
                        <Scissors size={18} style={{ marginRight: '8px' }} />
                        <span>선택한 도형에서 빼기</span>
                    </button>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4', marginTop: '4px', textAlign: 'center' }}>
                        * 선택된 도형과 겹쳐진<br />도형들끼리만 편집됩니다.
                    </div>
                </div>
            </div>
            <div className="sidebar-section" style={{ marginTop: '36px' }}>
                <div className="sidebar-title" style={{ color: '#0ea5e9' }}>
                    파일 내보내기/불러오기
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label
                        className="tool-btn action-btn text-xs"
                        style={{ flexDirection: 'row', width: '100%', padding: '12px', background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d', cursor: 'pointer', display: 'flex' }}
                    >
                        <Upload size={18} style={{ marginRight: '8px' }} />
                        <span>DXF 도면 불러오기</span>
                        <input type="file" accept=".dxf" hidden onChange={onImportDXF} />
                    </label>
                    <button
                        className="tool-btn action-btn text-xs"
                        style={{ flexDirection: 'row', width: '100%', padding: '12px', background: '#f0f9ff', borderColor: '#bae6fd', color: '#0284c7' }}
                        onClick={onExportDXF}
                    >
                        <Download size={18} style={{ marginRight: '8px' }} />
                        <span>DXF 도면으로 저장</span>
                    </button>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4', marginTop: '4px', textAlign: 'center' }}>
                        * 장비 커팅용으로 변환됩니다.
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
