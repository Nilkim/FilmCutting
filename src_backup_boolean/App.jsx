import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import './App.css';
import FilmSelector from './components/FilmSelector';
import Sidebar from './components/Sidebar';
import PricePanel from './components/PricePanel';
import DrawingCanvas from './components/DrawingCanvas';

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
  const [shapes, setShapes] = useState([]);
  const [activeShapeId, setActiveShapeId] = useState(null);

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

  const calculateMaxLength = () => {
    if (shapes.length === 0) return 0;

    let maxY = 0;
    shapes.forEach(shape => {
      let bottom = shape.y;
      const currentScaleY = shape.scaleY || 1;

      if (shape.type === 'rect') bottom += (shape.height || 0) * currentScaleY;
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
        <div className="header-actions">
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
        <Sidebar onAddShape={handleAddShape} />

        <div className="workspace">
          {selectedFilm ? (
            <DrawingCanvas
              selectedFilm={selectedFilm}
              shapes={shapes}
              setShapes={setShapes}
              activeShapeId={activeShapeId}
              setActiveShapeId={setActiveShapeId}
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
    </div>
  );
}

export default App;
