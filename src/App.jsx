import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import OrderPage from './pages/OrderPage';
import OrderCompletePage from './pages/OrderCompletePage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminLayoutPage from './pages/AdminLayoutPage';
import AdminFilmsPage from './pages/AdminFilmsPage';
import AdminOrdersPage from './pages/AdminOrdersPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/order" replace />} />
        <Route path="/order" element={<OrderPage />} />
        {/* 주문 조회는 OrderPage 내부 모달로 통합. 작성 중인 도면이 라우트
            전환으로 사라지지 않게 하기 위함. /order/lookup 직접 진입 또는
            기존 navigate('/order/lookup') 호출은 /order로 redirect되며
            state.openLookup으로 OrderPage가 모달을 자동 오픈한다. */}
        <Route
          path="/order/lookup"
          element={<Navigate to="/order" replace state={{ openLookup: true }} />}
        />
        <Route path="/order/complete/:code" element={<OrderCompletePage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayoutPage />}>
          <Route index element={<Navigate to="films" replace />} />
          <Route path="films" element={<AdminFilmsPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
