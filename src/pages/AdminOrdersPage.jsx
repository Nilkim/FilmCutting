import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const STATUS_TABS = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '대기' },
  { key: 'completed', label: '완료' },
  { key: 'cancelled', label: '취소' },
];

const STATUS_BADGE = {
  pending: { bg: '#e5e7eb', fg: '#374151', label: '대기' },
  completed: { bg: '#d1fae5', fg: '#065f46', label: '완료' },
  cancelled: { bg: '#fee2e2', fg: '#991b1b', label: '취소' },
};

function formatPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ko-KR');
  } catch {
    return iso;
  }
}

function formatPrice(v) {
  if (v == null) return '0원';
  return `${Number(v).toLocaleString('ko-KR')}원`;
}

function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [memoEditingId, setMemoEditingId] = useState(null);
  const [memoDraft, setMemoDraft] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message || '주문 목록을 불러오지 못했습니다.');
      setOrders([]);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const counts = useMemo(() => {
    const c = { all: orders.length, pending: 0, completed: 0, cancelled: 0 };
    for (const o of orders) {
      if (c[o.status] != null) c[o.status] += 1;
    }
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (activeTab !== 'all' && o.status !== activeTab) return false;
      if (!s) return true;
      const code = (o.order_code || '').toLowerCase();
      const phone = (o.phone || '').replace(/\D/g, '');
      const sDigits = s.replace(/\D/g, '');
      if (code.includes(s)) return true;
      if (sDigits && phone.startsWith(sDigits)) return true;
      return false;
    });
  }, [orders, activeTab, search]);

  const updateStatus = async (order, nextStatus) => {
    setBusyId(order.id);
    const prev = orders;
    setOrders((list) =>
      list.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o))
    );
    const { error: err } = await supabase
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', order.id);
    if (err) {
      alert(`상태 변경 실패: ${err.message}`);
      setOrders(prev);
    }
    setBusyId(null);
  };

  const downloadDxf = async (order) => {
    if (!order.dxf_file_path) return;
    setBusyId(order.id);
    try {
      const { data, error: err } = await supabase.storage
        .from('dxf-files')
        .createSignedUrl(order.dxf_file_path, 60);
      if (err || !data?.signedUrl) {
        alert(`다운로드 URL 생성 실패: ${err?.message || '알 수 없는 오류'}`);
        return;
      }
      const res = await fetch(data.signedUrl);
      if (!res.ok) {
        alert(`다운로드 실패: ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${order.order_code}.dxf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setBusyId(null);
    }
  };

  const startMemoEdit = (order) => {
    setMemoEditingId(order.id);
    setMemoDraft(order.memo || '');
  };

  const cancelMemoEdit = () => {
    setMemoEditingId(null);
    setMemoDraft('');
  };

  const saveMemo = async (order) => {
    setBusyId(order.id);
    const prev = orders;
    const next = memoDraft;
    setOrders((list) =>
      list.map((o) => (o.id === order.id ? { ...o, memo: next } : o))
    );
    const { error: err } = await supabase
      .from('orders')
      .update({ memo: next })
      .eq('id', order.id);
    if (err) {
      alert(`메모 저장 실패: ${err.message}`);
      setOrders(prev);
    } else {
      setMemoEditingId(null);
      setMemoDraft('');
    }
    setBusyId(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>주문 관리</h1>
        <button
          onClick={fetchOrders}
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            backgroundColor: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          새로고침
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '8px 14px',
                backgroundColor: active ? '#1f2937' : '#fff',
                color: active ? '#fff' : '#1f2937',
                border: '1px solid #d1d5db',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: active ? 600 : 400,
              }}
            >
              {t.label}
              <span
                style={{
                  marginLeft: 6,
                  padding: '1px 7px',
                  borderRadius: 10,
                  backgroundColor: active ? '#374151' : '#e5e7eb',
                  color: active ? '#fff' : '#374151',
                  fontSize: 12,
                }}
              >
                {counts[t.key] || 0}
              </span>
            </button>
          );
        })}

        <input
          type="text"
          placeholder="주문번호 또는 전화번호 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto',
            padding: '8px 10px',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            minWidth: 240,
          }}
        />
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: 4,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
          불러오는 중…
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: '#6b7280',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
          }}
        >
          주문이 없습니다
        </div>
      ) : (
        <div style={{ overflowX: 'auto', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', textAlign: 'left' }}>
                <th style={th}>주문번호</th>
                <th style={th}>고객</th>
                <th style={th}>전화</th>
                <th style={th}>필름</th>
                <th style={th}>수량</th>
                <th style={th}>금액</th>
                <th style={th}>접수일시</th>
                <th style={th}>상태</th>
                <th style={{ ...th, minWidth: 320 }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const badge = STATUS_BADGE[o.status] || STATUS_BADGE.pending;
                const snap = o.film_snapshot || {};
                const busy = busyId === o.id;
                const editingMemo = memoEditingId === o.id;
                return (
                  <tr key={o.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 15 }}>
                      {o.order_code}
                    </td>
                    <td style={td}>{o.customer_name || '—'}</td>
                    <td style={td}>{formatPhone(o.phone)}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            border: '1px solid #d1d5db',
                            backgroundColor: snap.color_hex || '#fff',
                          }}
                        />
                        <span>{snap.name || '-'}</span>
                      </div>
                    </td>
                    <td style={td}>
                      {o.unit_count}
                      <span style={{ color: '#6b7280', marginLeft: 4 }}>× 0.5m</span>
                    </td>
                    <td style={td}>{formatPrice(o.total_price)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDate(o.created_at)}</td>
                    <td style={td}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: 12,
                          fontSize: 12,
                          backgroundColor: badge.bg,
                          color: badge.fg,
                          fontWeight: 600,
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {o.status === 'pending' && (
                          <>
                            <button
                              style={btn('#059669')}
                              disabled={busy}
                              onClick={() => updateStatus(o, 'completed')}
                            >
                              작업완료 ✓
                            </button>
                            <button
                              style={btn('#dc2626')}
                              disabled={busy}
                              onClick={() => updateStatus(o, 'cancelled')}
                            >
                              취소 처리
                            </button>
                          </>
                        )}
                        {(o.status === 'completed' || o.status === 'cancelled') && (
                          <button
                            style={btn('#6b7280')}
                            disabled={busy}
                            onClick={() => updateStatus(o, 'pending')}
                          >
                            대기로 되돌리기
                          </button>
                        )}
                        <button
                          style={btn('#2563eb')}
                          disabled={busy || !o.dxf_file_path}
                          title={o.dxf_file_path ? '' : '파일 없음'}
                          onClick={() => downloadDxf(o)}
                        >
                          DXF 다운로드
                        </button>
                        <button
                          style={btn('#4b5563')}
                          disabled={busy}
                          onClick={() => startMemoEdit(o)}
                        >
                          메모
                        </button>
                      </div>
                      {editingMemo && (
                        <div style={{ marginTop: 8 }}>
                          <textarea
                            value={memoDraft}
                            onChange={(e) => setMemoDraft(e.target.value)}
                            rows={3}
                            style={{
                              width: '100%',
                              padding: 6,
                              border: '1px solid #d1d5db',
                              borderRadius: 4,
                              fontFamily: 'inherit',
                              fontSize: 13,
                              boxSizing: 'border-box',
                            }}
                            placeholder="메모 입력…"
                          />
                          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                            <button
                              style={btn('#059669')}
                              disabled={busy}
                              onClick={() => saveMemo(o)}
                            >
                              저장
                            </button>
                            <button style={btn('#9ca3af')} onClick={cancelMemoEdit}>
                              취소
                            </button>
                          </div>
                        </div>
                      )}
                      {!editingMemo && o.memo && (
                        <div
                          style={{
                            marginTop: 6,
                            padding: '4px 8px',
                            backgroundColor: '#fef3c7',
                            color: '#78350f',
                            borderRadius: 3,
                            fontSize: 12,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {o.memo}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = {
  padding: '10px 12px',
  fontWeight: 600,
  color: '#374151',
  borderBottom: '1px solid #e5e7eb',
  fontSize: 13,
};

const td = {
  padding: '10px 12px',
  verticalAlign: 'top',
  color: '#111827',
};

function btn(color) {
  return {
    padding: '5px 10px',
    fontSize: 12,
    backgroundColor: color,
    color: '#fff',
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

export default AdminOrdersPage;
