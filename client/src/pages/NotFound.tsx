import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="text-6xl">🔮</div>
      <h1 className="mt-3 text-3xl font-bold">404</h1>
      <p className="mt-1 text-gray-500">The crystal ball sees no page here.</p>
      <Link to="/" className="btn-primary mt-5">
        Back to dashboard
      </Link>
    </div>
  );
}
