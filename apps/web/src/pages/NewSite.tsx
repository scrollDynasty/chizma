import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { CanvasHandle } from "@/canvas/SketchCanvas";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";

// Excalidraw is large; load it only on the editor page.
const SketchCanvas = lazy(() => import("@/canvas/SketchCanvas"));

/** Excalidraw has no Uzbek UI yet; Russian is the closest familiar fallback. */
const EXCALIDRAW_LANG: Record<string, string> = {
  en: "en",
  ru: "ru-RU",
  "uz-Latn": "ru-RU",
  "uz-Cyrl": "ru-RU",
};

export function NewSite() {
  const { t, i18n } = useTranslation();
  const canvas = useRef<CanvasHandle | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const generate = async () => {
    if (!canvas.current) return;
    setBusy(true);
    try {
      const snapshot = await canvas.current.snapshot();
      if (snapshot) setPreviewUrl(URL.createObjectURL(snapshot.png));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Chizma
          </Link>
          <h1 className="text-sm text-muted-foreground">{t("newSite.title")}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={generate} disabled={count === 0 || busy}>
            {t("canvas.generate")}
          </Button>
          <LanguageSwitcher />
          <UserMenu />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          className="relative min-h-[60vh] flex-1 lg:min-h-0"
          aria-label={t("newSite.title")}
        >
          <Suspense fallback={<p className="p-6 text-muted-foreground">{t("canvas.loading")}</p>}>
            <SketchCanvas
              langCode={EXCALIDRAW_LANG[i18n.language] ?? "en"}
              onReady={(handle) => {
                canvas.current = handle;
              }}
              onElementCountChange={setCount}
            />
          </Suspense>
        </section>

        <aside className="flex flex-col gap-3 border-t border-border bg-muted p-4 lg:w-[38%] lg:border-t-0 lg:border-l">
          <h2 className="text-sm font-semibold">{t("canvas.previewTitle")}</h2>
          {previewUrl ? (
            <>
              <img
                src={previewUrl}
                alt=""
                className="w-full rounded-lg border border-border bg-white"
              />
              <p className="text-sm text-muted-foreground">{t("canvas.snapshotNote")}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("canvas.previewEmpty")}</p>
          )}
          <p className="mt-auto text-xs text-muted-foreground">{t("canvas.savedLocally")}</p>
        </aside>
      </div>
    </div>
  );
}
