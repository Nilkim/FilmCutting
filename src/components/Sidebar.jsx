import React from 'react';
import { Square, Circle, Triangle, Star, MessageSquare, Combine, Scissors, Upload, Film } from 'lucide-react';
import './Sidebar.css';

const TOOLS = [
    { id: 'rect', label: '사각형', icon: <Square size={24} /> },
    { id: 'circle', label: '원형', icon: <Circle size={24} /> },
    { id: 'triangle', label: '삼각형', icon: <Triangle size={24} /> },
    { id: 'star', label: '별표', icon: <Star size={24} /> },
    { id: 'bubble', label: '말풍선', icon: <MessageSquare size={24} /> },
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

const AddShapeSection = ({ onAddShape }) => (
    <div className="sidebar-section">
        <div className="sidebar-title">도형 추가</div>
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
    onAddShape,
    onMergeShapes,
    onImportDXF,
    selectedFilm,
    onOpenFilmSelector,
    section = 'all',
    className = '',
}) => {
    if (section === 'top') {
        return (
            <aside className={`sidebar sidebar-part ${className}`}>
                <FilmSection selectedFilm={selectedFilm} onOpenFilmSelector={onOpenFilmSelector} />
                <Divider />
                <AddShapeSection onAddShape={onAddShape} />
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
            <AddShapeSection onAddShape={onAddShape} />
            <Divider />
            <EditSection onMergeShapes={onMergeShapes} />
            <Divider />
            <FileSection onImportDXF={onImportDXF} />
        </aside>
    );
};

export default Sidebar;
