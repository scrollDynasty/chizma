import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchProviders, loginUrl, type Provider } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { rememberNext, safeNext } from "@/lib/next";

export function Login() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: ({ signal }) => fetchProviders(signal),
  });

  if (user) return <Navigate to={next} replace />;

  const start = (provider: Provider) => {
    rememberNext(next);
    window.location.assign(loginUrl(provider));
  };

  const available = providers.data?.providers ?? [];

  return (
    <Card className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
        <p className="text-muted-foreground">{t("login.subtitle")}</p>
      </div>
      <div className="flex flex-col gap-3">
        {available.map((provider) => (
          <Button key={provider} variant="outline" size="lg" onClick={() => start(provider)}>
            {t(`login.${provider}`)}
          </Button>
        ))}
        {providers.isSuccess && available.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("login.unavailable")}</p>
        ) : null}
        {providers.isError ? (
          <p className="text-sm text-danger">{t("login.errors.generic")}</p>
        ) : null}
      </div>
    </Card>
  );
}
