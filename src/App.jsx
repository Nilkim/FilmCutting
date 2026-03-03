import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { processTargetBoolean } from './utils/shapeBoolean';
import { useHistory } from './hooks/useHistory';
import { Undo2, Redo2 } from 'lucide-react';
import './App.css';
import FilmSelector from './components/FilmSelector';
import Sidebar from './components/Sidebar';
import PricePanel from './components/PricePanel';
import DrawingCanvas from './components/DrawingCanvas';
import ColorPalettePreview from './components/ColorPalettePreview';

// Mock DB for Films
const FILMS = [
  { id: 'f1', name: '솔리드 레드', color: '#ef4444', pricePer500: 5000 },
  { id: 'f2', name: '솔리드 블루', color: '#3b82f6', pricePer500: 5000 },
  { id: 'f3', name: '매트 블랙', color: '#1f2937', pricePer500: 6000 },
  { id: 'f4', name: '화이트 유광', color: '#f8fafc', pricePer500: 4500 },
  { id: 'f5', name: '우드 패턴(브라운)', color: '#854d0e', pricePer500: 7000 },
];

function App() {
  const [selectedFilm, setSelectedFilm] = useState(null); // Force selection on initial load
  const [isModalOpen, setIsModalOpen] = useState(true); // Open modal initially
  const [isPreviewMode, setIsPreviewMode] = useState(false); // Tone matching preview
  const { state: shapes, set: setShapes, undo, redo, canUndo, canRedo } = useHistory([], 5);
  const [activeShapeId, setActiveShapeId] = useState(null);

  // Handle keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleAddShape = (type) => {
    let newShape = {
      id: uuidv4(),
      type,
      x: 100, // Fixed initial coordinate system, relative to film (0 to 1220)
      y: 100,
      rotation: 0
    };

    if (type === 'rect') {
      newShape = { ...newShape, width: 200, height: 200 };
    } else if (type === 'circle') {
      newShape = { ...newShape, radius: 100 };
    } else if (type === 'triangle' || type === 'star') {
      newShape = { ...newShape, radius: 120 };
      if (type === 'star') {
        newShape = { ...newShape, numPoints: 5, innerRadius: 50, outerRadius: 100 };
        delete newShape.radius; // Star uses innerRadius/outerRadius, not radius
      }
    } else if (type === 'bubble') {
      newShape = { ...newShape, scaleX: 2, scaleY: 2 };
    }

    setShapes([...shapes, newShape]);
    setActiveShapeId(newShape.id);
  };

  const handleMergeShapes = (type) => {
    if (!activeShapeId) {
      alert('기준이 될 도형을 먼저 선택해 주세요.');
      return;
    }

    if (shapes.length < 2) {
      alert('병합/빼기를 하려면 캔버스 위에 도형이 2개 이상 있어야 합니다.');
      return;
    }

    const targetShape = shapes.find(s => s.id === activeShapeId);
    const otherShapes = shapes.filter(s => s.id !== activeShapeId);

    let result;
    try {
      result = processTargetBoolean(type, targetShape, otherShapes);
    } catch (e) {
      console.error(e);
      alert('도형 편집 중 오류가 발생했습니다.');
      return;
    }

    if (!result || !result.modified) {
      alert('선택한 도형과 겹쳐있는 다른 도형이 없습니다.');
      return;
    }

    // Keep shapes that were NOT consumed
    const remainingShapes = shapes.filter(s =>
      s.id !== activeShapeId && !result.consumedShapeIds.includes(s.id)
    );

    if (result.destroyed) {
      // Base shape completely subtracted
      setShapes(remainingShapes);
      setActiveShapeId(null);
    } else if (result.newShapesData) {
      const newShapesList = result.newShapesData.map((data, index) => ({
        id: `merged-${Date.now()}-${index}`,
        type: 'path',
        data: data.pathData,
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      }));

      setShapes([...remainingShapes, ...newShapesList]);

      if (newShapesList.length > 0) {
        setActiveShapeId(newShapesList[0].id);
      } else {
        setActiveShapeId(null);
      }
    }
  };

  const calculateMaxLength = () => {
    if (shapes.length === 0) return 0;

    let maxY = 0;
    shapes.forEach(shape => {
      let bottom = shape.y;
      const currentScaleY = shape.scaleY || 1;

      if (shape.type === 'rect') bottom += (shape.height || 0) * currentScaleY;
      else if (shape.type === 'path') bottom += (shape.height / 2 || 0) * currentScaleY; // the center is 0, so height/2 reaches bottom
      else if (shape.radius) bottom += shape.radius * currentScaleY;
      else if (shape.outerRadius) bottom += shape.outerRadius * currentScaleY; // for star
      else if (shape.type === 'bubble') bottom += 100 * currentScaleY; // for bubble path approximation

      if (bottom > maxY) maxY = bottom;
    });
    return maxY;
  };

  return (
    <div className="app-container">
      <header className="top-nav">
        <div className="logo">FILM CUTTING</div>

        <div className="history-actions" style={{ display: 'flex', gap: '8px', marginLeft: 'auto', marginRight: '24px' }}>
          <button
            onClick={undo}
            disabled={!canUndo}
            title="실행 취소 (Ctrl+Z)"
            style={{
              background: 'none', border: 'none', cursor: canUndo ? 'pointer' : 'not-allowed',
              opacity: canUndo ? 1 : 0.3, padding: '8px', color: 'var(--text-main)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '4px'
            }}
          >
            <Undo2 size={20} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="다시 실행 (Ctrl+Y)"
            style={{
              background: 'none', border: 'none', cursor: canRedo ? 'pointer' : 'not-allowed',
              opacity: canRedo ? 1 : 0.3, padding: '8px', color: 'var(--text-main)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '4px'
            }}
          >
            <Redo2 size={20} />
          </button>
        </div>

        <div className="header-actions">
          <button
            onClick={() => setIsPreviewMode(true)}
            title="컬러 테스트 보드 보기"
            style={{
              background: '#e2e8f0', border: 'none', cursor: 'pointer',
              padding: '6px 12px', color: '#334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '4px', fontSize: '13px', fontWeight: 'bold',
              marginRight: '12px'
            }}
          >
            컬러 톤 테스트
          </button>

          <div className="current-film-label">현재 선택된 필름</div>
          <button className="select-film-btn" onClick={() => setIsModalOpen(true)}>
            {selectedFilm ? (
              <>
                <div
                  style={{
                    width: '18px', height: '18px',
                    backgroundColor: selectedFilm.color,
                    borderRadius: '4px', border: '1px solid #cbd5e1'
                  }}
                />
                <span className="film-name-display">{selectedFilm.name}</span>
                <span className="change-btn-text">변경</span>
              </>
            ) : (
              <span className="change-btn-text">필름 선택하기</span>
            )}
          </button>
        </div>
      </header>

      <div className="main-content">
        <Sidebar
          onAddShape={handleAddShape}
          onMergeShapes={handleMergeShapes}
        />

        <div className="workspace">
          {selectedFilm ? (
            <DrawingCanvas
              selectedFilm={selectedFilm}
              shapes={shapes}
              setShapes={setShapes}
              activeShapeId={activeShapeId}
              setActiveShapeId={setActiveShapeId}
              maxLength={calculateMaxLength()}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--canvas-bg)' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <h3>먼저 필름을 선택해주세요</h3>
              </div>
            </div>
          )}
        </div>

        <div className="right-panel-wrapper">
          {selectedFilm && (
            <PricePanel
              selectedFilm={selectedFilm}
              maxLength={calculateMaxLength()}
            />
          )}
        </div>
      </div>

      {/* Modal for Film Selection */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => { if (selectedFilm) setIsModalOpen(false) }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2>필름 선택</h2>
              {selectedFilm && (
                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', fontSize: '20px' }}>✕</button>
              )}
            </div>
            <FilmSelector
              films={FILMS}
              selectedFilm={selectedFilm}
              onSelect={(film) => {
                setSelectedFilm(film);
                setIsModalOpen(false); // Close on selection
              }}
            />
          </div>
        </div>
      )}

      {/* Modal for Color Tone Preview */}
      {isPreviewMode && (
        <ColorPalettePreview onClose={() => setIsPreviewMode(false)} />
      )}
    </div>
  );
}

export default App;
