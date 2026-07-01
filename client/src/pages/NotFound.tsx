import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="text-6xl">🔮</div>
      <h1 className="mt-3 text-3xl font-bold">404</h1>
      <p className="mt-1 text-gray-500">{t("notFound.message")}</p>
      <Link to="/" className="btn-primary mt-5">
        {t("notFound.backToDashboard")}
      </Link>
    </div>
  );
}
