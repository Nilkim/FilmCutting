import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import paper from 'paper';
import { processTargetBoolean } from '../utils/shapeBoolean';
import { exportShapesToDXF, importDXFtoShapes } from '../utils/dxfExport';
import { useHistory } from '../hooks/useHistory';
import { useFilms } from '../hooks/useFilms';
import { useReorderLoader } from '../hooks/useReorderLoader';
import { supabase } from '../lib/supabase';
import { Undo2, Redo2, Menu } from 'lucide-react';
import FilmSelector from '../components/FilmSelector';
import Sidebar from '../components/Sidebar';
import PricePanel from '../components/PricePanel';
import DrawingCanvas from '../components/DrawingCanvas';
import ShapeSpecEditor from '../components/ShapeSpecEditor';
import OrderLookupPage from './OrderLookupPage';
import { createDefaultShapeData, generateForKind } from '../utils/shapeRegistry';

// Tracks viewport breakpoint so the spec editor can switch between an
// inline panel (desktop, docked in the right column) and a fullscreen modal
// overlay (mobile, where right-column space is too tight).
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 768px)').matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

function getSeoulDayKey() {
  // YYMMDD (서울 시각 기준, 2자리 연도)
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
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
  const [customerPhone, setCustomerPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [priceSheetOpen, setPriceSheetOpen] = useState(false);
  // 주문 조회를 라우트가 아닌 모달로 띄워 작성 중인 도형 상태를 보존.
  // location.state.openLookup이 true면(=/order/lookup redirect 또는
  // OrderCompletePage에서 진입) 자동 오픈.
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    if (location.state?.openLookup) {
      setIsLookupOpen(true);
      // 한 번 열고 나면 history state를 정리해 새로고침 시 다시 열리지
      // 않도록 한다.
      navigate('.', { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Sidebar tool buttons immediately add a default shape to the canvas;
  // the side panel (ShapeSpecEditor) then drives all spec editing live.
  // Boolean ops (merge/subtract) drop kind/params naturally — for those,
  // the editor falls back to a transform-only view.
  const isMobile = useIsMobile();
  const activeShape = activeShapeId ? shapes.find((s) => s.id === activeShapeId) : null;

  // Mobile spec sheet visibility — fully decoupled from selection.
  // 단일 탭(선택)은 시트를 열지 않는다. 모바일에서 도형이 생성되거나 탭되는
  // 즉시 모달이 뜨면 캔버스를 가려 거슬리기 때문. 시트는 명시적인 더블탭/
  // 더블클릭(handleRequestSpecEdit)으로만 열린다. 초기값을 true(닫힘)로 두면
  // 도형 생성 직후 자동 선택되어도 시트가 자동으로 뜨지 않는다.
  const [specSheetDismissed, setSpecSheetDismissed] = useState(true);
  const handleSelectShape = (id) => {
    setActiveShapeId(id);
  };
  // 더블탭/더블클릭 시: 선택 + 시트 열기. 데스크탑은 인라인 패널을 쓰므로
  // 이 상태가 무시되고, 모바일에서만 모달 트리거로 작동한다.
  const handleRequestSpecEdit = (id) => {
    setActiveShapeId(id);
    setSpecSheetDismissed(false);
  };

  useReorderLoader({ films, setSelectedFilm, setShapes, setIsModalOpen });

  // Lookup 모달에서 재주문 선택 시 — 작성 중이던 도면을 그대로 덮어쓴다
  // (사용자 결정). useHistory가 setShapes를 추적하므로 사용자가 실수해도
  // Ctrl+Z로 직전 도면 복원 가능.
  const handleReorderFromLookup = (order) => {
    const film = films.find((f) => f.id === order.film_id);
    if (film) {
      setSelectedFilm(film);
      setIsModalOpen(false);
    }
    if (Array.isArray(order.shapes_json)) {
      setShapes(order.shapes_json);
    }
    setActiveShapeId(null);
    setIsLookupOpen(false);
  };

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

  const handleRequestShape = async (kind) => {
    setSidebarOpen(false);
    try {
      const base = await createDefaultShapeData(kind);
      const newShape = {
        id: uuidv4(),
        type: 'parametric',
        ...base,
        x: 610,
        y: 400,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      };
      setShapes((prev) => [...prev, newShape]);
      handleSelectShape(newShape.id);
    } catch (err) {
      console.error('도형 생성 실패:', err);
    }
  };

  const handleDeleteShape = (shapeId) => {
    setShapes((prev) => prev.filter((s) => s.id !== shapeId));
    setActiveShapeId(null);
    // 모바일 시트에서 삭제한 경우 시트도 같이 닫는다. activeShape이 null이
    // 되어 시트가 어차피 unmount되지만, dismissed 상태를 명시적으로 정리해
    // 이후 새 도형을 더블탭했을 때의 동작을 일관되게 유지.
    setSpecSheetDismissed(true);
  };

  // 도형 복사: 원본 shape 객체를 깊게 복사하고 새 id 부여, 우측 위쪽으로
  // 살짝 오프셋해 시각적으로 새 도형이라는 걸 보여준다. Konva 좌표계는
  // y-down이라 "위쪽"은 y 감소. dragBoundFunc가 y >= 0으로 클램프하므로
  // 음수가 될 우려가 있으면 아래로 떨어뜨려 캔버스 밖으로 나가지 않게 한다.
  const handleDuplicateShape = (shapeId) => {
    const src = shapes.find((s) => s.id === shapeId);
    if (!src) return;
    const OFFSET = 30;
    const dy = src.y >= OFFSET ? -OFFSET : OFFSET;
    const copy = {
      ...src,
      // params 객체도 얕은 복사로 분리해 추후 spec 편집이 원본을 건드리지
      // 않도록 한다.
      ...(src.params ? { params: { ...src.params } } : {}),
      id: uuidv4(),
      x: src.x + OFFSET,
      y: src.y + dy,
    };
    setShapes((prev) => [...prev, copy]);
    handleSelectShape(copy.id);
  };

  // Live patch for the selected shape — used by ShapeSpecEditor for both
  // kind-form regen ({ params, pathData, width, height }) and transform
  // edits ({ scaleX | scaleY | rotation }). Just merges.
  const handleUpdateActiveShape = (patch) => {
    if (!activeShapeId) return;
    setShapes((prev) => prev.map((s) =>
      s.id === activeShapeId ? { ...s, ...patch } : s
    ));
  };

  // 캔버스에서 도형 transform이 끝났을 때(onTransformEnd) 자동 베이크.
  // parametric 도형(kind+params 보유)이고 scaleX/Y가 1이 아니면 비균일
  // scale을 base에 굽고 path 재생성, scaleX/Y를 1로 리셋한다. fillet/곡선
  // 등 원형 요소가 자동으로 정원형 유지되고, archHeight 같은 비례 dimension
  // 도 base에 포함되어 시각 비율 보존.
  //
  // 베이크 안 하는 케이스:
  //   - non-parametric (boolean으로 합쳐진 path 등 — kind/params 없음)
  //   - scaleX === scaleY === 1 (단순 위치/회전 변경)
  //   - text (size 파라미터로 자체 비율 관리, 별도 정책)
  //
  // **시각 크기 보존 — inset 보정**:
  //   삼각형/별의 buildFilletedPolygon은 vertex 안쪽으로 fillet을 굽혀
  //   path bounds < params. 그대로 두면 베이크할 때마다 시각 크기가
  //   줄어드는 압축 효과 발생. 현재 ratio(shape.width / params.width)를
  //   유지하면서 newParams.width = visualW / ratio로 보정해 generator가
  //   inset 후에도 visualW 근처를 출력하도록.
  //
  // **fillet 보존**: fillet 값(mm)은 그대로 — 사용자 입력 절대 mm를 컷팅
  //   정확도 위해 보존.
  // **archHeight 베이크**: archHeight는 비례 변환 (params.archHeight * sy)
  //   해서 시각 비율(반원/얕은 돔/뾰족 총알머리) 유지.
  const applyShapeChange = async (shapeId, nextShape) => {
    const current = shapes.find((s) => s.id === shapeId);
    if (!current) return;
    const sx = nextShape.scaleX || 1;
    const sy = nextShape.scaleY || 1;
    const isParametric = nextShape.kind && nextShape.params && nextShape.kind !== 'text';
    if (!isParametric || (sx === 1 && sy === 1)) {
      setShapes((prev) => prev.map((s) => (s.id === shapeId ? nextShape : s)));
      return;
    }
    const ratioW = current.width && current.params?.width ? current.width / current.params.width : 1;
    const ratioH = current.height && current.params?.height ? current.height / current.params.height : 1;
    const visualW = (current.width || 0) * sx;
    const visualH = (current.height || 0) * sy;
    const newParams = {
      ...nextShape.params,
      width: ratioW > 0 ? visualW / ratioW : visualW,
      height: ratioH > 0 ? visualH / ratioH : visualH,
    };
    if (nextShape.params.archHeight !== undefined) {
      newParams.archHeight = (nextShape.params.archHeight || 0) * sy;
    }
    try {
      const g = await generateForKind(nextShape.kind, newParams);
      setShapes((prev) => prev.map((s) => (s.id === shapeId ? {
        ...nextShape,
        params: newParams,
        pathData: g.pathData,
        width: g.width,
        height: g.height,
        scaleX: 1,
        scaleY: 1,
      } : s)));
    } catch (err) {
      console.error('shape bake failed:', err);
      // 폴백: 베이크 실패 시 기존 단순 set
      setShapes((prev) => prev.map((s) => (s.id === shapeId ? nextShape : s)));
    }
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
        handleSelectShape(newShapesList[0].id);
      } else {
        setActiveShapeId(null);
      }
    }
  };

  // Real geometry-based bottom: parses each shape's pathData with Paper.js,
  // applies the same scale + rotation Konva uses, then takes the actual
  // tight bbox.bottom of the rendered outline. This matches what the user
  // visually sees (a rotated triangle's true lowest vertex, not a loose
  // bounding box) so the billable-area trigger never fires "before" the
  // shape has actually crossed the boundary.
  //
  // Memoized on `shapes` — useHistory replaces the array immutably on edits
  // so this only re-runs when geometry actually changes, not on unrelated
  // re-renders (panel toggles, hover, etc.).
  const maxLength = useMemo(() => {
    if (shapes.length === 0) return 0;
    if (!paper.project) paper.setup(new paper.Size(1, 1));

    let maxY = 0;
    for (const shape of shapes) {
      const sx = shape.scaleX || 1;
      const sy = shape.scaleY || 1;
      const data = shape.pathData || shape.data;
      let bottom = shape.y;

      if (data) {
        const item = paper.PathItem.create(data);
        item.scale(sx, sy, new paper.Point(0, 0));
        if (shape.rotation) item.rotate(shape.rotation, new paper.Point(0, 0));
        bottom = shape.y + item.bounds.bottom;
        item.remove();
      } else if (shape.height) {
        bottom += (shape.height / 2) * sy;
      } else if (shape.radius) {
        bottom += shape.radius * sy;
      } else if (shape.outerRadius) {
        bottom += shape.outerRadius * sy;
      }

      if (bottom > maxY) maxY = bottom;
    }
    return maxY;
  }, [shapes]);

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
    const phone4 = digits.slice(-4);
    return `${phone4}-${getSeoulDayKey()}-???`;
  })();

  const handleSubmitOrder = async () => {
    const phoneDigits = customerPhone.replace(/\D/g, '');

    const errs = {};
    if (phoneDigits.length < 10) errs.phone = '전화번호를 10자리 이상 입력해 주세요.';
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const phone4 = phoneDigits.slice(-4);
      const dayKey = getSeoulDayKey();

      const { data: seq, error: seqError } = await supabase.rpc('next_order_seq', {
        p_day: dayKey,
      });
      if (seqError) throw seqError;

      const seqNum = typeof seq === 'number' ? seq : parseInt(seq, 10);
      const orderCode = `${phone4}-${dayKey}-${String(seqNum).padStart(3, '0')}`;

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
        customer_name: '',
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
        handleSelectShape(importedShape.id);
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

        <div className="logo">
          <img src="/logo.svg" alt="COTYLEDON" className="brand-logo" />
          <span className="brand-suffix">필름모양내기</span>
        </div>

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

          <button
            type="button"
            onClick={() => setIsLookupOpen(true)}
            className="lookup-link-btn"
            title="내 주문 조회"
          >
            주문 조회
          </button>
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
            onRequestShape={handleRequestShape}
            onMergeShapes={handleMergeShapes}
            onImportDXF={handleImportDXF}
            selectedFilm={selectedFilm}
            onOpenFilmSelector={() => { setIsModalOpen(true); setSidebarOpen(false); }}
          />
        </div>

        <div className="sidebar-wrapper sidebar-mobile-top">
          <Sidebar
            section="top"
            onRequestShape={handleRequestShape}
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
                setActiveShapeId={handleSelectShape}
                onRequestSpecEdit={handleRequestSpecEdit}
                onShapeChange={applyShapeChange}
                maxLength={maxLength}
                onDeleteShape={handleDeleteShape}
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
              {/* Spec editor goes ABOVE the price panel — the user spends
                  most of their time editing shape specs, so it's the
                  primary right-column tool. PricePanel stays visible
                  below as the "summary" footer. Desktop only — mobile
                  uses a fullscreen modal (rendered separately below). */}
              {!isMobile && activeShape && (
                <div className="right-side-edit-area">
                  <ShapeSpecEditor
                    shape={activeShape}
                    onUpdate={handleUpdateActiveShape}
                    onDelete={() => handleDeleteShape(activeShape.id)}
                    onDuplicate={() => handleDuplicateShape(activeShape.id)}
                  />
                </div>
              )}
              <PricePanel
                selectedFilm={selectedFilm}
                maxLength={maxLength}
                onOrder={handleOpenOrderForm}
                canOrder={canOrder}
              />
            </>
          )}
        </div>
      </div>

      {/* Mobile-only: spec editor as a bottom-sheet modal. The desktop
          inline panel is hidden on mobile (see right-panel-wrapper above)
          so this modal is the only spec-edit surface for small screens.
          Tap backdrop or the close button to dismiss (also deselects so
          the user can re-tap a shape to bring it back). */}
      {isMobile && activeShape && !specSheetDismissed && (
        <div
          className="spec-modal-backdrop"
          onClick={() => setSpecSheetDismissed(true)}
        >
          <div
            className="spec-modal-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="spec-modal-close"
              onClick={() => setSpecSheetDismissed(true)}
              aria-label="닫기"
            >
              ✕
            </button>
            <ShapeSpecEditor
              shape={activeShape}
              onUpdate={handleUpdateActiveShape}
              onDelete={() => handleDeleteShape(activeShape.id)}
              onDuplicate={() => handleDuplicateShape(activeShape.id)}
            />
          </div>
        </div>
      )}

      {/* 주문 조회 모달 — 라우트로 분리하지 않아 OrderPage가 unmount되지
          않으므로 작성 중인 도형/필름/undo 스택이 보존된다. 재주문 선택 시
          handleReorderFromLookup이 도면을 덮어쓴다. */}
      {isLookupOpen && (
        <div className="modal-overlay" onClick={() => setIsLookupOpen(false)}>
          <div className="modal-content lookup-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="lookup-modal-close"
              onClick={() => setIsLookupOpen(false)}
              aria-label="닫기"
            >
              ✕
            </button>
            <OrderLookupPage
              embedded
              onClose={() => setIsLookupOpen(false)}
              onSelectReorder={handleReorderFromLookup}
            />
          </div>
        </div>
      )}

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
              <div style={{ color: '#b45309', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
                ⚠ 플랫폼 결제 시에도 반드시 <u>동일한 전화번호</u>로 주문해 주세요.
              </div>
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
                  {Math.ceil(Math.max(maxLength, 0) / 500)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>예상 총 금액</span>
                <span>
                  {(Math.ceil(Math.max(maxLength, 0) / 500) * selectedFilm.pricePer500).toLocaleString()}원
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
