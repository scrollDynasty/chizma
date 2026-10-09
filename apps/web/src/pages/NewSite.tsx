import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { CanvasHandle } from "@/canvas/SketchCanvas";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { fetchQuota } from "@/lib/api";
import { LOW_CONFIDENCE } from "@/lib/scene";
import { PreviewFrame } from "@/preview/PreviewFrame";
import { useGeneration } from "@/preview/useGeneration";

// Excalidraw is large; load it only on the editor page.
const SketchCanvas = lazy(() => import("@/canvas/SketchCanvas"));

/** Excalidraw has no Uzbek UI yet; Russian is the closest familiar fallback. */
const EXCALIDRAW_LANG: Record<string, string> = {
  en: "en",
  ru: "ru-RU",
  "uz-Latn": "ru-RU",
  "uz-Cyrl": "ru-RU",
};

const KNOWN_ERRORS = new Set([
  "daily_limit",
  "budget_exhausted",
  "too_fast",
  "generation_disabled",
  "ai_unavailable",
  "ai_invalid_output",
  "image_too_large",
  "timeout",
]); // prettier-ignore

export function NewSite() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const canvas = useRef<CanvasHandle | null>(null);
  const [count, setCount] = useState(0);
  const [aspect, setAspect] = useState(1);
  const { state, generate } = useGeneration();
  const quota = useQuery({ queryKey: ["quota"], queryFn: ({ signal }) => fetchQuota(signal) });

  const working = state.phase === "working";

  useEffect(() => {
    if (state.phase === "done" || state.phase === "failed") {
      void queryClient.invalidateQueries({ queryKey: ["quota"] });
    }
  }, [state.phase, queryClient]);

  const onGenerate = async () => {
    const snapshot = await canvas.current?.snapshot();
    if (!snapshot) return;
    setAspect(snapshot.bounds.width / Math.max(snapshot.bounds.height, 1));
    await generate({
      png: snapshot.png,
      shapes: snapshot.shapes,
      width: snapshot.bounds.width,
      height: snapshot.bounds.height,
      locale: i18n.language,
    });
  };

  const unsure =
    state.phase === "done"
      ? (state.job.scene?.elements ?? []).filter((e) => e.confidence < LOW_CONFIDENCE)
      : [];

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Chizma
          </Link>
          <h1 className="text-sm text-muted-foreground">{t("newSite.title")}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={onGenerate} disabled={count === 0 || working}>
            {t("canvas.generate")}
          </Button>
          <LanguageSwitcher />
          <UserMenu />
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        <section
          className="relative h-[65vh] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink"
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

        <aside className="flex flex-col gap-3 border-t border-border bg-muted p-4 lg:min-h-0 lg:w-[42%] lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <h2 className="text-sm font-semibold">{t("canvas.previewTitle")}</h2>

          {state.phase === "idle" ? (
            <p className="text-sm text-muted-foreground">{t("canvas.previewEmpty")}</p>
          ) : null}

          {state.phase === "working" ? (
            <p role="status" className="text-sm">
              {t(`gen.stage.${state.stage}`, { defaultValue: t("gen.stage.queued") })}
            </p>
          ) : null}

          {state.phase === "failed" ? (
            <p role="alert" className="text-sm text-danger">
              {t(`gen.errors.${KNOWN_ERRORS.has(state.error) ? state.error : "generic"}`)}
            </p>
          ) : null}

          {state.phase === "done" && state.job.blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("gen.empty")}</p>
          ) : null}

          {state.phase === "done" && state.job.blocks.length > 0 ? (
            <div className="flex flex-1 flex-col gap-3 lg:min-h-0">
              <PreviewFrame job={state.job} aspect={aspect} />
              {unsure.length > 0 ? (
                <div className="text-sm">
                  <p className="font-medium">{t("gen.unsure")}</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {unsure.map((element) => (
                      <li key={element.id}>{element.label}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-auto flex flex-col gap-1 text-xs text-muted-foreground">
            {quota.data ? (
              <span>
                {t("gen.quota", { remaining: quota.data.remaining, limit: quota.data.limit })}
              </span>
            ) : null}
            <span>{t("canvas.savedLocally")}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
