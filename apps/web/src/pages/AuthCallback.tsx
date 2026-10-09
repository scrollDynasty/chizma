import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Card } from "@/components/ui/card";
import { exchangeCode } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { takeNext } from "@/lib/next";

const KNOWN_ERRORS = new Set(["not_allowed", "oauth_failed"]);

export function AuthCallback() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(() => {
    const reason = params.get("error");
    if (reason) return KNOWN_ERRORS.has(reason) ? reason : "generic";
    return params.get("code") ? null : "generic";
  });
  // The code is single-use; StrictMode runs effects twice in development.
  const started = useRef(false);

  useEffect(() => {
    const code = params.get("code");
    if (error || !code || started.current) return;
    started.current = true;
    exchangeCode(code)
      .then(({ access_token, user }) => {
        signIn(access_token, user);
        navigate(takeNext(), { replace: true });
      })
      .catch(() => setError("generic"));
  }, [error, params, signIn, navigate]);

  return (
    <Card className="mx-auto flex w-full max-w-md flex-col gap-4 p-8">
      {error ? (
        <>
          <p role="alert">{t(`login.errors.${error}`)}</p>
          <Link to="/login" className="text-sm font-medium underline">
            {t("login.back")}
          </Link>
        </>
      ) : (
        <p role="status">{t("login.signingIn")}</p>
      )}
    </Card>
  );
}
