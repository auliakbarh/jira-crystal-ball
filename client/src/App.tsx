import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import GuestLogin from "./pages/GuestLogin";
import Health from "./pages/Health";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import Board from "./pages/Board";
import PreviousSprints from "./pages/PreviousSprints";
import Settings from "./pages/Settings";

function Protected({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/guest" replace />;
}

// Routes guests may not access (admin/management).
function AdminOrMember({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  return user?.isGuest ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/guest" element={<GuestLogin />} />
      <Route path="/health" element={<Health />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="board" element={<Board />} />
        <Route path="previous" element={<PreviousSprints />} />
        <Route
          path="settings"
          element={
            <AdminOrMember>
              <Settings />
            </AdminOrMember>
          }
        />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
