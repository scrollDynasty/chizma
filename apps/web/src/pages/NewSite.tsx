import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { CanvasHandle } from "@/canvas/SketchCanvas";
import type { SketchBounds } from "@/canvas/shapes";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { fetchQuota } from "@/lib/api";
import { LOW_CONFIDENCE, type SceneElement } from "@/lib/scene";
import { GenerationLoader } from "@/preview/GenerationLoader";
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
 * draw --Generate--> generating --> deciding --Accept--> draw (blocks stay, keep editing)
 *   ^                                  |
 *   +-------- Back to drawing ---------+   Try again: back + generate once more
 *
 * The result is put on the canvas itself, in place of the strokes it came from. Accepted
 * blocks are ordinary canvas objects: move, resize, delete, undo, draw more, generate again.
 */
type Mode = "draw" | "generating" | "deciding";

export function NewSite() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const canvas = useRef<CanvasHandle | null>(null);
  const frame = useRef<SketchBounds | null>(null);
  const [sketchCount, setSketchCount] = useState(0);
  const [mode, setMode] = useState<Mode>("draw");
  const [unsure, setUnsure] = useState<SceneElement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { state, generate } = useGeneration();
  const quota = useQuery({ queryKey: ["quota"], queryFn: ({ signal }) => fetchQuota(signal) });

  useEffect(() => {
    if (state.phase === "done") {
      if (state.job.blocks.length === 0 || !frame.current) {
        setError("empty");
        setMode("draw");
      } else {
        canvas.current?.showResult(state.job, frame.current, i18n.language);
        setUnsure((state.job.scene?.elements ?? []).filter((e) => e.confidence < LOW_CONFIDENCE));
        setMode("deciding");
      }
    } else if (state.phase === "failed") {
      setError(state.error);
      setMode("draw");
    }
    if (state.phase === "done" || state.phase === "failed") {
      void queryClient.invalidateQueries({ queryKey: ["quota"] });
    }
  }, [state, queryClient, i18n.language]);

  const startGeneration = async () => {
    const snapshot = await canvas.current?.snapshot();
    if (!snapshot) return;
    frame.current = snapshot.bounds;
    setError(null);
    setUnsure([]);
    setMode("generating");
    await generate({
      png: snapshot.png,
      shapes: snapshot.shapes,
      width: snapshot.bounds.width,
      height: snapshot.bounds.height,
      locale: i18n.language,
    });
  };

  const backToDrawing = () => {
    canvas.current?.discardResult();
    setUnsure([]);
    setMode("draw");
  };

  const tryAgain = async () => {
    canvas.current?.discardResult();
    await startGeneration();
  };

  const accept = () => {
    canvas.current?.acceptResult();
    setUnsure([]);
    setMode("draw");
  };

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
          <Button onClick={startGeneration} disabled={sketchCount === 0 || mode !== "draw"}>
            {t("canvas.generate")}
          </Button>
          <LanguageSwitcher />
          <UserMenu />
        </div>
      </header>

      <section className="relative isolate min-h-0 flex-1" aria-label={t("newSite.title")}>
        <div className="absolute inset-0">
          <Suspense fallback={<p className="p-6 text-muted-foreground">{t("canvas.loading")}</p>}>
            <SketchCanvas
              langCode={EXCALIDRAW_LANG[i18n.language] ?? "en"}
              locked={mode !== "draw"}
              onReady={(handle) => {
                canvas.current = handle;
              }}
              onSketchCountChange={setSketchCount}
            />
          </Suspense>
        </div>

        {mode === "generating" ? <GenerationLoader stage={stage} /> : null}

        {error && mode === "draw" ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4">
            <p
              role="alert"
              className="pointer-events-auto rounded-full bg-card px-5 py-2.5 text-sm text-danger shadow-[var(--shadow-soft)]"
            >
              {t(errorKey)}
            </p>
          </div>
        ) : null}

        {mode === "deciding" && unsure.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4">
            <p className="rounded-full bg-card px-5 py-2.5 text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
              {t("result.unsure", { list: unsure.map((e) => e.label).join(", ") })}
            </p>
          </div>
        ) : null}

        {mode === "deciding" ? (
          <div className="absolute inset-x-0 bottom-6 z-40 flex justify-center px-4">
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-full bg-card p-2 shadow-[var(--shadow-soft)] ring-1 ring-border">
              <Button variant="ghost" onClick={backToDrawing}>
                <span aria-hidden="true">←</span> {t("result.back")}
              </Button>
              <Button variant="outline" onClick={tryAgain}>
                <span aria-hidden="true">↻</span> {t("result.again")}
              </Button>
              <Button onClick={accept}>
                <span aria-hidden="true">✓</span> {t("result.accept")}
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
