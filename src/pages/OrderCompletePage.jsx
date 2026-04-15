import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function OrderCompletePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      alert('복사에 실패했습니다. 번호를 직접 선택해 복사해주세요.');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        padding: '24px',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '40px',
          maxWidth: '560px',
          width: '100%',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ marginTop: 0, color: '#0f172a' }}>주문이 접수되었습니다</h1>
        <p style={{ color: '#475569', lineHeight: 1.6 }}>
          주문이 정상적으로 접수되었습니다.
          <br />
          아래 주문번호를 결제 플랫폼에 입력해주세요.
        </p>

        <div
          style={{
            margin: '24px 0',
            padding: '20px',
            background: '#f1f5f9',
            borderRadius: '8px',
            border: '1px dashed #94a3b8',
            fontSize: '22px',
            fontWeight: 'bold',
            letterSpacing: '1px',
            wordBreak: 'break-all',
            color: '#0f172a',
          }}
        >
          {code}
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleCopy}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '12px 20px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            {copied ? '복사되었습니다 ✓' : '번호 복사'}
          </button>
          <button
            onClick={() => navigate('/order')}
            style={{
              background: '#e2e8f0',
              color: '#0f172a',
              border: 'none',
              padding: '12px 20px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            새 주문 작성
          </button>
        </div>

        <div style={{ marginTop: '24px', fontSize: '13px', color: '#64748b' }}>
          다음에 이 주문 다시 불러오기:{' '}
          <a
            href="/order/lookup"
            style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }}
            onClick={(e) => {
              e.preventDefault();
              navigate('/order/lookup');
            }}
          >
            주문 조회로 이동
          </a>
        </div>
      </div>
    </div>
  );
}

export default OrderCompletePage;
