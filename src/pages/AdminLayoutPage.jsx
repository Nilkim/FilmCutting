import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function AdminLayoutPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (!session) {
        navigate('/admin/login', { replace: true });
      } else {
        setChecking(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/admin/login', { replace: true });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login', { replace: true });
  };

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        확인 중…
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <nav className="admin-nav">
        <div className="admin-nav-brand">FILM CUTTING 관리</div>
        <button
          className="admin-nav-toggle"
          aria-label="메뉴 열기"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
        <div className={`admin-nav-links ${menuOpen ? 'open' : ''}`}>
          <Link to="/admin/films" onClick={() => setMenuOpen(false)}>필름 관리</Link>
          <Link to="/admin/orders" onClick={() => setMenuOpen(false)}>주문 관리</Link>
          <button className="admin-logout-btn" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </nav>
      <main className="admin-main">
        <Outlet />
      </main>

      <style>{`
        .admin-layout {
          min-height: 100vh;
          background-color: #f8fafc;
        }
        .admin-nav {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 12px 24px;
          background-color: #1f2937;
          color: #fff;
          position: relative;
        }
        .admin-nav-brand {
          font-weight: bold;
        }
        .admin-nav-toggle {
          display: none;
          background: none;
          border: none;
          color: #fff;
          font-size: 22px;
          margin-left: auto;
          cursor: pointer;
          padding: 4px 10px;
        }
        .admin-nav-links {
          display: flex;
          align-items: center;
          gap: 24px;
          flex: 1;
        }
        .admin-nav-links a {
          color: #fff;
          text-decoration: none;
        }
        .admin-logout-btn {
          margin-left: auto;
          padding: 6px 12px;
          background-color: #dc2626;
          color: #fff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .admin-main {
          padding: 24px;
        }
        @media (max-width: 768px) {
          .admin-nav {
            flex-wrap: wrap;
            padding: 12px 16px;
            gap: 12px;
          }
          .admin-nav-toggle {
            display: inline-block;
          }
          .admin-nav-links {
            display: none;
            width: 100%;
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
          }
          .admin-nav-links.open {
            display: flex;
          }
          .admin-nav-links a {
            padding: 10px 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          }
          .admin-logout-btn {
            margin-left: 0;
            width: 100%;
          }
          .admin-main {
            padding: 16px 12px;
          }
        }
      `}</style>
    </div>
  );
}

export default AdminLayoutPage;
