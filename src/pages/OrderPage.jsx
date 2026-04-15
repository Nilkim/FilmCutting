import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { processTargetBoolean } from '../utils/shapeBoolean';
import { exportShapesToDXF, importDXFtoShapes } from '../utils/dxfExport';
import { useHistory } from '../hooks/useHistory';
import { KoreanSafeInput } from '../components/KoreanSafeInput';
import { useFilms } from '../hooks/useFilms';
import { useReorderLoader } from '../hooks/useReorderLoader';
import { supabase } from '../lib/supabase';
import { Undo2, Redo2, Menu } from 'lucide-react';
import FilmSelector from '../components/FilmSelector';
import Sidebar from '../components/Sidebar';
import PricePanel from '../components/PricePanel';
import DrawingCanvas from '../components/DrawingCanvas';

function getSeoulDayKey() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}${m}${d}`;
}

function formatPhoneInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

const Stepper = ({ currentStep, onStepClick, canGoStep2, canGoStep3 }) => {
  const steps = ["필름 선택", "재단 모양 내기", "주문서 확인"];
  return (
    <div className="stepper-container">
      {steps.map((step, idx) => {
        const stepNum = idx + 1;
        const isActive = currentStep === stepNum;
        const isPassed = currentStep > stepNum;
        let clickable = false;
        if (stepNum === 1) clickable = true;
        else if (stepNum === 2) clickable = canGoStep2;
        else if (stepNum === 3) clickable = canGoStep3;
        return (
          <React.Fragment key={idx}>
            <div
              className={`step-item ${isActive ? 'active' : ''} ${isPassed ? 'passed' : ''} ${clickable ? 'clickable' : ''}`}
              onClick={() => clickable && onStepClick && onStepClick(stepNum)}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : -1}
            >
              <div className="step-circle">{isPassed ? '✓' : stepNum}</div>
              <span className="step-label">{step}</span>
            </div>
            {idx < steps.length - 1 && <div className="step-divider" />}
          </React.Fragment>
        );
      })}
    </div>
  );
};

function OrderPage() {
  const navigate = useNavigate();
  const { films, loading: filmsLoading } = useFilms();
  const [selectedFilm, setSelectedFilm] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(true);
  const { state: shapes, set: setShapes, undo, redo, canUndo, canRedo } = useHistory([], 5);
  const [activeShapeId, setActiveShapeId] = useState(null);
  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [priceSheetOpen, setPriceSheetOpen] = useState(false);

  useReorderLoader({ films, setSelectedFilm, setShapes, setIsModalOpen });

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
      x: 100,
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
        delete newShape.radius;
      }
    } else if (type === 'bubble') {
      newShape = { ...newShape, scaleX: 2, scaleY: 2 };
    }

    setShapes(prev => [...prev, newShape]);
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

    if (targetShape.isDxf) {
      return;
    }

    const otherShapes = shapes.filter(s => s.id !== activeShapeId && !s.isDxf);

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

    const remainingShapes = shapes.filter(s =>
      s.id !== activeShapeId && !result.consumedShapeIds.includes(s.id)
    );

    if (result.destroyed) {
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

      if (shape.type === 'rect') bottom += (shape.height || 0) / 2 * currentScaleY;
      else if (shape.type === 'path') bottom += (shape.height || 0) / 2 * currentScaleY;
      else if (shape.radius) bottom += shape.radius * currentScaleY;
      else if (shape.outerRadius) bottom += shape.outerRadius * currentScaleY;
      else if (shape.type === 'bubble') bottom += 100 * currentScaleY;

      if (bottom > maxY) maxY = bottom;
    });
    return maxY;
  };

  const canOrder = !!selectedFilm && shapes.length > 0;

  const handleOpenOrderForm = () => {
    if (!selectedFilm) {
      alert('먼저 필름을 선택해 주세요.');
      return;
    }
    if (shapes.length === 0) {
      alert('캔버스에 도형을 하나 이상 추가해 주세요.');
      return;
    }
    setFormErrors({});
    setIsOrderFormOpen(true);
  };

  const handleStepClick = (stepNum) => {
    if (stepNum === 1) {
      setIsModalOpen(true);
    } else if (stepNum === 2) {
      setIsOrderFormOpen(false);
      setIsModalOpen(false);
    } else if (stepNum === 3) {
      handleOpenOrderForm();
    }
  };

  const handlePhoneChange = (e) => {
    setCustomerPhone(formatPhoneInput(e.target.value));
    if (formErrors.phone) setFormErrors((prev) => ({ ...prev, phone: null }));
  };

  const handleNameChange = (e) => {
    setCustomerName(e.target.value);
    if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: null }));
  };

  const previewOrderCode = (() => {
    const digits = customerPhone.replace(/\D/g, '');
    if (digits.length < 8) return null;
    const phone8 = digits.slice(-8);
    return `${phone8}-${getSeoulDayKey()}-???`;
  })();

  const handleSubmitOrder = async () => {
    const nameTrimmed = customerName.trim();
    const phoneDigits = customerPhone.replace(/\D/g, '');

    const errs = {};
    if (!nameTrimmed) errs.name = '이름을 입력해 주세요.';
    if (phoneDigits.length < 10) errs.phone = '전화번호를 10자리 이상 입력해 주세요.';
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const phone8 = phoneDigits.slice(-8);
      const dayKey = getSeoulDayKey();

      const { data: seq, error: seqError } = await supabase.rpc('next_order_seq', {
        p_day: dayKey,
      });
      if (seqError) throw seqError;

      const seqNum = typeof seq === 'number' ? seq : parseInt(seq, 10);
      const orderCode = `${phone8}-${dayKey}-${String(seqNum).padStart(3, '0')}`;

      const dxfString = exportShapesToDXF(shapes);
      if (!dxfString) throw new Error('DXF 변환에 실패했습니다.');
      const dxfBlob = new Blob([dxfString], { type: 'application/dxf' });
      const dxfPath = `${orderCode}.dxf`;

      const { error: uploadError } = await supabase.storage
        .from('dxf-files')
        .upload(dxfPath, dxfBlob, {
          contentType: 'application/dxf',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const maxLength = calculateMaxLength();
      const billableLength = Math.ceil(Math.max(maxLength, 0) / 500) * 500;
      const unitCount = billableLength / 500;
      const totalPrice = unitCount * selectedFilm.pricePer500;

      const filmSnapshot = {
        name: selectedFilm.name,
        color_hex: selectedFilm.color,
        price_per_500: selectedFilm.pricePer500,
      };

      const { error: insertError } = await supabase.from('orders').insert({
        order_code: orderCode,
        customer_name: nameTrimmed,
        phone: phoneDigits,
        film_id: selectedFilm.id,
        film_snapshot: filmSnapshot,
        unit_count: unitCount,
        total_price: totalPrice,
        shapes_json: shapes,
        dxf_file_path: dxfPath,
      });
      if (insertError) throw insertError;

      navigate(`/order/complete/${orderCode}`);
    } catch (err) {
      console.error('Order submit failed', err);
      alert(`주문 접수 중 오류가 발생했습니다: ${err.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleImportDXF = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dxfContent = event.target.result;
      const importedShape = importDXFtoShapes(dxfContent);

      if (importedShape) {
        setShapes(prev => [...prev, importedShape]);
        setActiveShapeId(importedShape.id);
      } else {
        alert("DXF 파일을 불러오는 데 실패했거나 빈 도면입니다.");
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const currentStep = !selectedFilm ? 1 : isOrderFormOpen ? 3 : 2;

  if (filmsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        필름 목록 로딩 중…
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="top-nav">
        <button
          className="hamburger-btn"
          aria-label="메뉴 열기"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <Menu size={22} />
        </button>

        <div className="logo">FILM CUTTING</div>

        <Stepper
          currentStep={currentStep}
          onStepClick={handleStepClick}
          canGoStep2={!!selectedFilm}
          canGoStep3={canOrder}
        />

        <div className="header-actions">
          <div className="history-actions">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="실행 취소 (Ctrl+Z)"
              className="icon-btn"
            >
              <Undo2 size={20} />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="다시 실행 (Ctrl+Y)"
              className="icon-btn"
            >
              <Redo2 size={20} />
            </button>
          </div>

          <Link
            to="/order/lookup"
            className="lookup-link-btn"
            title="내 주문 조회"
          >
            주문 조회
          </Link>
        </div>
      </header>

      <div className="main-content">
        {sidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div className={`sidebar-wrapper sidebar-desktop ${sidebarOpen ? 'open' : ''}`}>
          <Sidebar
            onAddShape={(t) => { handleAddShape(t); setSidebarOpen(false); }}
            onMergeShapes={handleMergeShapes}
            onImportDXF={handleImportDXF}
            selectedFilm={selectedFilm}
            onOpenFilmSelector={() => { setIsModalOpen(true); setSidebarOpen(false); }}
          />
        </div>

        <div className="sidebar-wrapper sidebar-mobile-top">
          <Sidebar
            section="top"
            onAddShape={handleAddShape}
            selectedFilm={selectedFilm}
            onOpenFilmSelector={() => setIsModalOpen(true)}
          />
        </div>

        <div className="workspace">
          {selectedFilm ? (
            <div className="canvas-scroll-wrapper">
              <DrawingCanvas
                selectedFilm={selectedFilm}
                shapes={shapes}
                setShapes={setShapes}
                activeShapeId={activeShapeId}
                setActiveShapeId={setActiveShapeId}
                maxLength={calculateMaxLength()}
              />
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--canvas-bg)' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <h3>먼저 필름을 선택해주세요</h3>
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-wrapper sidebar-mobile-bottom">
          <Sidebar
            section="bottom"
            onMergeShapes={handleMergeShapes}
            onImportDXF={handleImportDXF}
          />
        </div>

        <div className={`right-panel-wrapper ${priceSheetOpen ? 'sheet-open' : ''}`}>
          {selectedFilm && (
            <>
              <button
                className="price-sheet-toggle"
                onClick={() => setPriceSheetOpen((v) => !v)}
                aria-label="가격 상세 토글"
              >
                가격 상세 {priceSheetOpen ? '▼' : '▲'}
              </button>
              <PricePanel
                selectedFilm={selectedFilm}
                maxLength={calculateMaxLength()}
                onOrder={handleOpenOrderForm}
                canOrder={canOrder}
              />
            </>
          )}
        </div>
      </div>

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
              films={films}
              selectedFilm={selectedFilm}
              onSelect={(film) => {
                setSelectedFilm(film);
                setIsModalOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {isOrderFormOpen && selectedFilm && (
        <div
          className="modal-overlay"
          onClick={() => { if (!submitting) setIsOrderFormOpen(false); }}
        >
          <div
            className="modal-content order-form-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '420px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }}>주문서 확인</h2>
              <button
                onClick={() => { if (!submitting) setIsOrderFormOpen(false); }}
                disabled={submitting}
                style={{ background: 'none', fontSize: '20px', border: 'none', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ color: '#475569', fontSize: '13px', marginTop: 0 }}>
              주문을 접수하려면 아래 정보를 입력해 주세요.
            </p>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                이름 <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <KoreanSafeInput
                type="text"
                value={customerName}
                onChange={(v) => {
                  setCustomerName(v);
                  if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: null }));
                }}
                disabled={submitting}
                placeholder="성함을 입력하세요"
                style={{
                  width: '100%', padding: '10px',
                  border: `1px solid ${formErrors.name ? '#dc2626' : '#cbd5e1'}`,
                  borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box'
                }}
              />
              {formErrors.name && (
                <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
                  {formErrors.name}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                전화번호 <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={handlePhoneChange}
                disabled={submitting}
                placeholder="010-0000-0000"
                style={{
                  width: '100%', padding: '10px',
                  border: `1px solid ${formErrors.phone ? '#dc2626' : '#cbd5e1'}`,
                  borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box'
                }}
              />
              {formErrors.phone && (
                <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
                  {formErrors.phone}
                </div>
              )}
              {previewOrderCode && !formErrors.phone && (
                <div style={{ color: '#64748b', fontSize: '12px', marginTop: '6px' }}>
                  예상 주문번호: <code style={{ color: '#2563eb' }}>{previewOrderCode}</code>
                </div>
              )}
            </div>

            <div
              style={{
                background: '#f1f5f9', padding: '12px', borderRadius: '6px',
                fontSize: '13px', color: '#334155', marginBottom: '16px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>필름</span>
                <span>{selectedFilm.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>수량 (0.5m 단위)</span>
                <span>
                  {Math.ceil(Math.max(calculateMaxLength(), 0) / 500)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>예상 총 금액</span>
                <span>
                  {(Math.ceil(Math.max(calculateMaxLength(), 0) / 500) * selectedFilm.pricePer500).toLocaleString()}원
                </span>
              </div>
            </div>

            <button
              onClick={handleSubmitOrder}
              disabled={submitting}
              style={{
                width: '100%', padding: '12px', background: submitting ? '#94a3b8' : '#2563eb',
                color: '#fff', border: 'none', borderRadius: '6px',
                fontSize: '15px', fontWeight: 'bold',
                cursor: submitting ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              {submitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  처리 중…
                </>
              ) : (
                '주문 접수'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrderPage;
