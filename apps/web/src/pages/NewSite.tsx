import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { CanvasHandle } from "@/canvas/SketchCanvas";
import { type GeneratedSite, loadAcceptedSite, type Stage, saveAcceptedSite } from "@/canvas/site";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { fetchQuota } from "@/lib/api";
import { LOW_CONFIDENCE } from "@/lib/scene";
import { cn } from "@/lib/utils";
import { ResultFrame } from "@/preview/ResultFrame";
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
]);

/**
 * draw --Generate--> generating --> result --Accept--> accepted
 *   ^                                  | Back / Try again     | Edit drawing
 *   +----------------------------------+----------------------+
 * The result replaces the sketch in the same place; the drawing stays intact underneath.
 */
type Mode = "draw" | "generating" | "result" | "accepted";

export function NewSite() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const canvas = useRef<CanvasHandle | null>(null);
  const [count, setCount] = useState(0);
  const [mode, setMode] = useState<Mode>("draw");
  const [result, setResult] = useState<GeneratedSite | null>(null);
  // Canvas size of the generation in flight, so the result is drawn at exactly that size.
  const pendingStage = useRef<Stage>({ width: 0, height: 0 });
  const [error, setError] = useState<string | null>(null);
  const { state, generate } = useGeneration();
  const quota = useQuery({ queryKey: ["quota"], queryFn: ({ signal }) => fetchQuota(signal) });

  // Coming back to the editor shows the site you accepted last time.
  useEffect(() => {
    void loadAcceptedSite().then((site) => {
      if (site?.stage) {
        setResult(site);
        setMode((current) => (current === "draw" ? "accepted" : current));
      }
    });
  }, []);

  useEffect(() => {
    if (state.phase === "done") {
      if (state.job.blocks.length === 0) {
        setError("empty");
        setMode("draw");
      } else {
        setResult({ job: state.job, stage: pendingStage.current });
        setMode("result");
      }
    } else if (state.phase === "failed") {
      setError(state.error);
      setMode("draw");
    }
    if (state.phase === "done" || state.phase === "failed") {
      void queryClient.invalidateQueries({ queryKey: ["quota"] });
    }
  }, [state, queryClient]);

  const onGenerate = async () => {
    const snapshot = await canvas.current?.snapshot();
    if (!snapshot) return;
    setError(null);
    pendingStage.current = snapshot.viewport;
    setMode("generating");
    await generate({
      png: snapshot.png,
      shapes: snapshot.shapes,
      width: snapshot.bounds.width,
      height: snapshot.bounds.height,
      locale: i18n.language,
    });
  };

  const accept = async () => {
    if (!result) return;
    await saveAcceptedSite(result);
    setMode("accepted");
  };

  const backToDrawing = () => {
    setError(null);
    setMode("draw");
  };

  const showingResult = (mode === "result" || mode === "accepted") && result !== null;
  const unsure =
    showingResult && result
      ? (result.job.scene?.elements ?? []).filter((e) => e.confidence < LOW_CONFIDENCE)
      : [];
  const stage = state.phase === "working" ? state.stage : "uploading";
  const errorKey =
    error === "empty"
      ? "gen.empty"
      : `gen.errors.${error && KNOWN_ERRORS.has(error) ? error : "generic"}`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Chizma
          </Link>
          <h1 className="text-sm text-muted-foreground">{t("newSite.title")}</h1>
        </div>
        <div className="flex items-center gap-3">
          {quota.data ? (
            <span className="hidden text-xs text-muted-foreground md:inline">
              {t("gen.quota", { remaining: quota.data.remaining, limit: quota.data.limit })}
            </span>
          ) : null}
          {mode === "draw" || mode === "generating" ? (
            <Button onClick={onGenerate} disabled={count === 0 || mode === "generating"}>
              {t("canvas.generate")}
            </Button>
          ) : null}
          <LanguageSwitcher />
          <UserMenu />
        </div>
      </header>

      <section className="relative min-h-0 flex-1" aria-label={t("newSite.title")}>
        {/* The canvas stays mounted (and keeps its view) while the result is on screen. */}
        <div
          className={cn(
            "absolute inset-0",
            showingResult && "pointer-events-none invisible opacity-0",
          )}
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
        </div>

        {mode === "generating" ? (
          <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-[2px]">
            <div
              role="status"
              className="flex items-center gap-3 rounded-full bg-card px-5 py-3 text-sm shadow-[var(--shadow-soft)]"
            >
              <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
              {t(`gen.stage.${stage}`, { defaultValue: t("gen.stage.queued") })}
            </div>
          </div>
        ) : null}

        {showingResult && result ? (
          <ResultFrame site={result} className="absolute inset-0 size-full" />
        ) : null}

        {error && mode === "draw" ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
            <p
              role="alert"
              className="pointer-events-auto rounded-full bg-card px-5 py-2.5 text-sm text-danger shadow-[var(--shadow-soft)]"
            >
              {t(errorKey)}
            </p>
          </div>
        ) : null}

        {unsure.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
            <p className="rounded-full bg-card px-5 py-2.5 text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
              {t("result.unsure", { list: unsure.map((e) => e.label).join(", ") })}
            </p>
          </div>
        ) : null}

        {showingResult ? (
          <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-full bg-card p-2 shadow-[var(--shadow-soft)] ring-1 ring-border">
              {mode === "result" ? (
                <>
                  <Button variant="ghost" onClick={backToDrawing}>
                    <span aria-hidden="true">←</span> {t("result.back")}
                  </Button>
                  <Button variant="outline" onClick={onGenerate}>
                    <span aria-hidden="true">↻</span> {t("result.again")}
                  </Button>
                  <Button onClick={accept}>
                    <span aria-hidden="true">✓</span> {t("result.accept")}
                  </Button>
                </>
              ) : (
                <>
                  <span className="px-3 text-sm font-medium text-success">
                    <span aria-hidden="true">✓</span> {t("result.accepted")}
                  </span>
                  <Button variant="outline" onClick={backToDrawing}>
                    <span aria-hidden="true">←</span> {t("result.edit")}
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
