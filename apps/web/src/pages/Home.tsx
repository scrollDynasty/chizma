import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-16">
      <section className="flex flex-col items-start gap-6">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          {t("tagline")}
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">{t("description")}</p>
        <Button size="lg" onClick={() => navigate("/new")}>
          {t("createSite")}
        </Button>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">{t("templates")}</h2>
        <Card>
          <p className="text-muted-foreground">{t("templatesSoon")}</p>
        </Card>
      </section>
    </div>
  );
}
