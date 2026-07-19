// ============================================================
// withRouter.jsx — HOC wrapper untuk inject navigate ke class component
// Dibutuhkan ErrorBoundary (class component) agar bisa akses useNavigate
// ============================================================
import { useNavigate } from "react-router-dom";

export function withRouter(Component) {
  return function Wrapped(props) {
    const navigate = useNavigate();
    return <Component {...props} navigate={navigate} />;
  };
}
