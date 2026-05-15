import React from 'react';
import { Square, Circle, Triangle, Star, MessageSquare, Type, Combine, Scissors, Upload, Film } from 'lucide-react';

// Inline arch icon — lucide doesn't ship one. Z closes the bottom edge.
const ArchIcon = ({ size = 24 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M4 21 L4 11 A8 8 0 0 1 20 11 L20 21 Z" />
    </svg>
);
import './Sidebar.css';

const TOOLS = [
    { id: 'rect', label: '사각형', icon: <Square size={24} /> },
    { id: 'circle', label: '원형', icon: <Circle size={24} /> },
    { id: 'triangle', label: '삼각형', icon: <Triangle size={24} /> },
    { id: 'star', label: '별표', icon: <Star size={24} /> },
    { id: 'bubble', label: '말풍선', icon: <MessageSquare size={24} /> },
    { id: 'arch', label: '아치', icon: <ArchIcon size={24} /> },
    { id: 'text', label: '텍스트', icon: <Type size={24} /> },
];

const FilmSection = ({ selectedFilm, onOpenFilmSelector }) => (
    <div className="sidebar-section film-indicator-section">
        <div className="sidebar-title">
            <Film size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            선택된 필름
        </div>
        {selectedFilm ? (
            <div className="current-film-card">
                <div className="current-film-swatch">
                    {selectedFilm.previewImageUrl ? (
                        <img src={selectedFilm.previewImageUrl} alt={selectedFilm.name} />
                    ) : (
                        <div
                            className="current-film-swatch-fallback"
                            style={{ backgroundColor: selectedFilm.color }}
                        />
                    )}
                </div>
                <div className="current-film-meta">
                    <div className="current-film-name">{selectedFilm.name}</div>
                    <div className="current-film-price">
                        {selectedFilm.pricePer500.toLocaleString()}원 / 0.5m
                    </div>
                </div>
                <button
                    className="current-film-change-btn"
                    onClick={onOpenFilmSelector}
                >
                    변경
                </button>
            </div>
        ) : (
            <button
                className="film-select-cta"
                onClick={onOpenFilmSelector}
            >
                필름 선택하기
            </button>
        )}
    </div>
);

// 관리자가 등록한 비정형 도형은 (0,0) 중심으로 정규화된 path이므로
// viewBox를 baseWidth/Height 기준 중앙 정렬로 잡으면 24px 아이콘 안에서
// 자연스럽게 보인다. 미리보기 이미지가 있으면 그걸 우선 사용.
//
// vector-effect="non-scaling-stroke"를 쓰면 viewBox 스케일과 무관하게
// stroke가 항상 픽셀 단위로 그려져, 도형 크기·비율과 무관하게 lucide
// 아이콘과 동일한 시각적 두께(2px)를 유지한다.
const CustomShapeIcon = ({ shape, size = 24 }) => {
    if (shape.previewImageUrl) {
        return (
            <img
                src={shape.previewImageUrl}
                alt={shape.name}
                width={size}
                height={size}
                style={{ objectFit: 'contain' }}
            />
        );
    }
    const w = shape.baseWidth || 100;
    const h = shape.baseHeight || 100;
    const pad = Math.max(w, h) * 0.08;
    const vbW = w + pad * 2;
    const vbH = h + pad * 2;
    return (
        <svg
            width={size}
            height={size}
            viewBox={`${-vbW / 2} ${-vbH / 2} ${vbW} ${vbH}`}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path
                d={shape.pathData}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
};

const AddShapeSection = ({ onRequestShape, customShapes = [] }) => (
    <div className="sidebar-section">
        <div className="sidebar-title">도형 추가</div>
        <div className="tools-grid">
            {TOOLS.map(tool => (
                <button
                    key={tool.id}
                    className="tool-btn"
                    onClick={() => onRequestShape(tool.id)}
                    onMouseUp={(e) => e.currentTarget.blur()}
                >
                    <div className="tool-icon">{tool.icon}</div>
                    <span className="tool-label">{tool.label}</span>
                </button>
            ))}
            {customShapes.map(cs => (
                <button
                    key={cs.id}
                    className="tool-btn"
                    onClick={() => onRequestShape({ kind: 'custom', customShape: cs })}
                    onMouseUp={(e) => e.currentTarget.blur()}
                    title={cs.name}
                >
                    <div className="tool-icon">
                        <CustomShapeIcon shape={cs} />
                    </div>
                    <span className="tool-label">{cs.name}</span>
                </button>
            ))}
        </div>
        <div className="shape-add-hint">
            <b>더블클릭</b> → 세부옵션
        </div>
    </div>
);

const EditSection = ({ onMergeShapes }) => (
    <div className="sidebar-section">
        <div className="sidebar-title" style={{ color: '#8b5cf6' }}>편집</div>
        <div className="action-row">
            <button
                className="tool-btn action-btn text-xs action-btn-row"
                onClick={() => onMergeShapes('union')}
            >
                <Combine size={18} style={{ marginRight: '8px' }} />
                <span>도형합치기</span>
            </button>
            <button
                className="tool-btn action-btn text-xs action-btn-row"
                onClick={() => onMergeShapes('subtract')}
            >
                <Scissors size={18} style={{ marginRight: '8px' }} />
                <span>도형빼기</span>
            </button>
        </div>
        <div className="section-hint">
            * 선택된 도형과 겹쳐진 도형들끼리만 편집됩니다.
        </div>
    </div>
);

const FileSection = ({ onImportDXF }) => (
    <div className="sidebar-section">
        <div className="sidebar-title" style={{ color: '#0ea5e9' }}>파일</div>
        <div className="action-row">
            <label className="tool-btn action-btn text-xs action-btn-row file-import-btn">
                <Upload size={18} style={{ marginRight: '8px' }} />
                <span>도면직접입력 (dxf)</span>
                <input type="file" accept=".dxf" hidden onChange={onImportDXF} />
            </label>
        </div>
    </div>
);

const Divider = () => <div className="sidebar-divider" />;

const Sidebar = ({
    onRequestShape,
    onMergeShapes,
    onImportDXF,
    selectedFilm,
    onOpenFilmSelector,
    customShapes = [],
    section = 'all',
    className = '',
}) => {
    if (section === 'top') {
        return (
            <aside className={`sidebar sidebar-part ${className}`}>
                <FilmSection selectedFilm={selectedFilm} onOpenFilmSelector={onOpenFilmSelector} />
                <Divider />
                <AddShapeSection onRequestShape={onRequestShape} customShapes={customShapes} />
            </aside>
        );
    }
    if (section === 'bottom') {
        return (
            <aside className={`sidebar sidebar-part ${className}`}>
                <EditSection onMergeShapes={onMergeShapes} />
                <Divider />
                <FileSection onImportDXF={onImportDXF} />
            </aside>
        );
    }
    return (
        <aside className={`sidebar ${className}`}>
            <FilmSection selectedFilm={selectedFilm} onOpenFilmSelector={onOpenFilmSelector} />
            <Divider />
            <AddShapeSection onRequestShape={onRequestShape} customShapes={customShapes} />
            <Divider />
            <EditSection onMergeShapes={onMergeShapes} />
            <Divider />
            <FileSection onImportDXF={onImportDXF} />
        </aside>
    );
};

export default Sidebar;
