import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const ADMIN_EMAIL = 'nilkim79@gmail.com';

function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password,
    });
    setLoading(false);
    if (error) {
      setError(error.message || '로그인에 실패했습니다.');
    } else {
      navigate('/admin/films');
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#f1f5f9'
    }}>
      <form onSubmit={handleSubmit} style={{
        backgroundColor: '#fff', padding: '32px', borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '320px'
      }}>
        <h1 style={{ marginBottom: '24px', fontSize: '20px' }}>관리자 로그인</h1>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
          style={{
            width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1',
            borderRadius: '4px', fontSize: '14px', marginBottom: '16px',
            boxSizing: 'border-box'
          }}
        />
        {error && (
          <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: '10px', backgroundColor: '#1f2937', color: '#fff',
            border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px', fontWeight: 'bold'
          }}
        >
          {loading ? '...' : '로그인'}
        </button>
      </form>
    </div>
  );
}

export default AdminLoginPage;
