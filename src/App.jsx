import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import OrderPage from './pages/OrderPage';
import OrderCompletePage from './pages/OrderCompletePage';
import OrderLookupPage from './pages/OrderLookupPage';
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
        <Route path="/order/lookup" element={<OrderLookupPage />} />
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
