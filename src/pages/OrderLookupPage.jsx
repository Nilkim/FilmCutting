import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './OrderLookupPage.css';

function formatPhone(input) {
  const digits = (input || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatPrice(n) {
  if (typeof n !== 'number') return '-';
  return n.toLocaleString('ko-KR') + '원';
}

function StatusBadge({ status }) {
  const map = {
    pending: { cls: 'pending', label: '대기' },
    done: { cls: 'done', label: '완료' },
    completed: { cls: 'done', label: '완료' },
    cancelled: { cls: 'cancelled', label: '취소' },
    canceled: { cls: 'cancelled', label: '취소' },
  };
  const info = map[status] || { cls: 'pending', label: status || '대기' };
  return <span className={`status-badge ${info.cls}`}>{info.label}</span>;
}

// embedded=true면 OrderPage의 모달 안에서 렌더되는 모드 — 작성 중인
// 캔버스 상태를 유지하기 위해 라우트로 분리하지 않고 모달로 띄움.
// 이때 재주문 선택은 navigate 대신 onSelectReorder 콜백으로 처리하고,
// 풀페이지 wrapper(.lookup-page) 및 "돌아가기" 링크를 생략한다.
export default function OrderLookupPage({ embedded = false, onClose, onSelectReorder } = {}) {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null); // null = not searched, [] = empty

  const handlePhoneChange = (e) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9) {
      setError('전화번호를 정확히 입력해주세요.');
      return;
    }
    setError(null);
    setLoading(true);
    setResults(null);
    const { data, error: rpcError } = await supabase.rpc('list_orders_by_phone', {
      p_phone: digits,
    });
    setLoading(false);
    if (rpcError) {
      console.error('order lookup rpc error:', rpcError);
      setError(`조회 실패: ${rpcError.message || rpcError.code || '알 수 없는 오류'}`);
      return;
    }
    setResults(data || []);
  };

  const handleReorder = (order) => {
    // 모달 모드: OrderPage의 콜백을 호출해 setSelectedFilm/setShapes 직접
    // 처리. 풀페이지 모드(deep-link redirect 후 fallback): 기존 navigate
    // state 흐름 유지 — 현재는 redirect로 이 코드 경로에 도달하지 않지만,
    // 향후 standalone 진입이 다시 필요해질 수 있으므로 보존.
    if (embedded && onSelectReorder) {
      onSelectReorder(order);
      return;
    }
    navigate('/order', {
      state: {
        reorderFrom: {
          shapes_json: order.shapes_json,
          film_id: order.film_id,
          order_code: order.order_code,
        },
      },
    });
  };

  const inner = (
    <div className="lookup-container">
        <div className="lookup-header">
          <h1>주문 조회</h1>
          <p>주문 시 입력한 전화번호로 주문 내역을 확인할 수 있습니다.</p>
        </div>

        <form className="lookup-form" onSubmit={handleSubmit}>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="010-0000-0000"
            value={phone}
            onChange={handlePhoneChange}
            autoComplete="tel"
          />
          <button type="submit" disabled={loading}>
            {loading ? '조회 중…' : '조회'}
          </button>
        </form>

        {loading && <div className="lookup-state">조회 중…</div>}

        {!loading && error && <div className="lookup-state error">{error}</div>}

        {!loading && !error && results && results.length === 0 && (
          <div className="lookup-state">해당 전화번호로 접수된 주문이 없습니다.</div>
        )}

        {!loading && !error && results && results.length > 0 && (
          <div className="order-list">
            {results.map((order) => {
              const film = order.film_snapshot || {};
              return (
                <div key={order.order_code} className="order-card">
                  <div className="order-card-row">
                    <span className="order-code">{order.order_code}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <div className="order-card-row">
                    <span className="order-date">{formatDate(order.created_at)}</span>
                  </div>
                  <div className="order-card-row">
                    <div className="film-row">
                      <span
                        className="film-swatch"
                        style={{ background: film.color_hex || '#e2e8f0' }}
                      />
                      <span className="film-name">{film.name || '필름 정보 없음'}</span>
                    </div>
                    <span className="order-meta">{order.unit_count} × 0.5m</span>
                  </div>
                  <div className="order-card-row">
                    <span className="order-meta">총 금액</span>
                    <span className="order-price">{formatPrice(order.total_price)}</span>
                  </div>
                  <button
                    type="button"
                    className="reorder-btn"
                    onClick={() => handleReorder(order)}
                  >
                    이 도면으로 새 주문 작성
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {!embedded && (
          <div style={{ textAlign: 'center' }}>
            <Link to="/order" className="back-link">
              ← 새 주문 작성으로 돌아가기
            </Link>
          </div>
        )}
      </div>
  );

  if (embedded) {
    // 모달 안에서는 풀페이지 wrapper(.lookup-page) 없이 바로 렌더.
    // modal-content가 자체 padding/배경을 제공하므로 중복 회피.
    return inner;
  }
  return <div className="lookup-page">{inner}</div>;
}
