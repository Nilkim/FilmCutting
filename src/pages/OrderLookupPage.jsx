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

export default function OrderLookupPage() {
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
      setError('조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    setResults(data || []);
  };

  const handleReorder = (order) => {
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

  return (
    <div className="lookup-page">
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

        <div style={{ textAlign: 'center' }}>
          <Link to="/order" className="back-link">
            ← 새 주문 작성으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
