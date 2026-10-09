import { useTranslation } from "react-i18next";
import { ApiStatus } from "@/components/ApiStatus";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function App() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <span className="text-lg font-semibold tracking-tight">Chizma</span>
        <LanguageSwitcher />
      </header>

      <main className="flex flex-1 flex-col gap-16 py-12">
        <section className="flex flex-col items-start gap-6">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            {t("tagline")}
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">{t("description")}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="lg" disabled>
              {t("createSite")}
            </Button>
            <span className="text-sm text-muted-foreground">{t("comingSoon")}</span>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">{t("templates")}</h2>
          <Card>
            <p className="text-muted-foreground">{t("templatesSoon")}</p>
          </Card>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-6">
        <ApiStatus />
        <a
          className="text-sm text-muted-foreground hover:text-foreground"
          href="https://github.com/scrollDynasty/chizma"
        >
          GitHub · AGPL-3.0
        </a>
      </footer>
    </div>
  );
}
