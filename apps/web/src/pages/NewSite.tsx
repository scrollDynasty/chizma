import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { describeAction } from "@/actions/describe";
import type { Action } from "@/actions/types";
import { stepVersion, withNewVersion } from "@/canvas/blocks";
import type { CanvasHandle, PageLayout, SelectedBlock, StrokesOver } from "@/canvas/SketchCanvas";
import type { SketchBounds } from "@/canvas/shapes";
import { ActionEditor } from "@/components/ActionEditor";
import { BlockPanel, DrawOverBar, QuestionCard } from "@/components/BlockPanel";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SitePreview } from "@/components/SitePreview";
import { SubmissionsDialog } from "@/components/SubmissionsDialog";
import { TryLayer } from "@/components/TryLayer";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { fetchQuota } from "@/lib/api";
import { GENERATION_STEPS, GenerationLoader, REFINE_STEPS } from "@/preview/GenerationLoader";
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
  "nothing_to_change",
  "nothing_drawn",
]);

/**
 * draw --Generate--> generating --> deciding --Accept--> draw (blocks stay, keep editing)
 *   ^                                  | Back / Try again; answer a question -> refining
 *   |
 *   +-- select a block: change in words -> refining -> draw
 *                       draw over -> drawOver --Apply--> refining -> draw
 *
 * Only the canvas is locked while a request runs or a result waits for a decision.
 */
type Mode = "draw" | "generating" | "deciding" | "drawOver" | "refining" | "try";

interface RefineTarget {
  id: string;
  answered: boolean;
  strokeIds: readonly string[];
  returnTo: Mode;
}

interface DrawOver {
  blockId: string;
  label: string;
  before: Set<string>;
}

export function NewSite() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const canvas = useRef<CanvasHandle | null>(null);
  const frame = useRef<SketchBounds | null>(null);
  const job = useRef<"generate" | "refine">("generate");
  const refineTarget = useRef<RefineTarget | null>(null);
  const [sketchCount, setSketchCount] = useState(0);
  const [mode, setMode] = useState<Mode>("draw");
  const [selected, setSelected] = useState<SelectedBlock | null>(null);
  const [pendingBlocks, setPendingBlocks] = useState<SelectedBlock[]>([]);
  const [drawOver, setDrawOver] = useState<DrawOver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionFor, setActionFor] = useState<SelectedBlock | null>(null);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [site, setSite] = useState<PageLayout | null>(null);
  const { state, generate, refine } = useGeneration();
  const quota = useQuery({ queryKey: ["quota"], queryFn: ({ signal }) => fetchQuota(signal) });

  useEffect(() => {
    if (state.phase === "done" || state.phase === "failed") {
      void queryClient.invalidateQueries({ queryKey: ["quota"] });
    }
    if (state.phase === "failed") {
      setError(state.error);
      setMode(job.current === "refine" ? (refineTarget.current?.returnTo ?? "draw") : "draw");
      return;
    }
    if (state.phase !== "done") return;

    if (job.current === "refine") {
      const target = refineTarget.current;
      const block = state.job.blocks[0];
      const current = target ? canvas.current?.getBlock(target.id) : null;
      if (target && block && current) {
        const data = withNewVersion(current.data, block, target.answered);
        canvas.current?.updateBlock(target.id, data);
        if (target.strokeIds.length > 0) canvas.current?.removeElements(target.strokeIds);
        setPendingBlocks((blocks) => blocks.map((b) => (b.id === target.id ? { ...b, data } : b)));
      }
      setMode(target?.returnTo ?? "draw");
      // Keep the edited block selected so the next change is one step away.
      if (target && target.returnTo === "draw") {
        window.setTimeout(() => canvas.current?.select(target.id), 0);
      }
      return;
    }

    if (state.job.blocks.length === 0 || !frame.current) {
      setError("empty");
      setMode("draw");
      return;
    }
    const added = canvas.current?.showResult(state.job, frame.current, i18n.language) ?? [];
    setPendingBlocks(added);
    setMode("deciding");
  }, [state, queryClient, i18n.language]);

  const startGeneration = async () => {
    const snapshot = await canvas.current?.snapshot();
    if (!snapshot) return;
    frame.current = snapshot.bounds;
    job.current = "generate";
    setError(null);
    setMode("generating");
    await generate({
      png: snapshot.png,
      shapes: snapshot.shapes,
      width: snapshot.bounds.width,
      height: snapshot.bounds.height,
      locale: i18n.language,
    });
  };

  const startRefine = async (
    target: SelectedBlock,
    options: { instruction?: string; strokes?: StrokesOver | null; answered?: boolean },
    returnTo: Mode,
  ) => {
    refineTarget.current = {
      id: target.id,
      answered: options.answered ?? false,
      strokeIds: options.strokes?.ids ?? [],
      returnTo,
    };
    job.current = "refine";
    setError(null);
    setMode("refining");
    await refine({
      element: target.data.element,
      html: target.data.html,
      css: target.data.css,
      width: target.width,
      height: target.height,
      locale: target.data.locale,
      instruction: options.instruction,
      png: options.strokes?.png,
      shapes: options.strokes?.shapes,
    });
  };

  const answer = (target: SelectedBlock, option: string, returnTo: Mode) => {
    const question = target.data.question?.text ?? "";
    void startRefine(
      target,
      { instruction: `Clarification. Question: "${question}" Answer: ${option}`, answered: true },
      returnTo,
    );
  };

  const backToDrawing = () => {
    canvas.current?.discardResult();
    setPendingBlocks([]);
    setMode("draw");
  };

  const tryAgain = async () => {
    canvas.current?.discardResult();
    setPendingBlocks([]);
    await startGeneration();
  };

  const accept = () => {
    canvas.current?.acceptResult();
    setPendingBlocks([]);
    setMode("draw");
  };

  const beginDrawOver = (block: SelectedBlock) => {
    const before = canvas.current?.elementIds() ?? new Set<string>();
    setError(null);
    setDrawOver({ blockId: block.id, label: block.data.label, before });
    setMode("drawOver");
  };

  const newStrokeIds = (over: DrawOver) =>
    [...(canvas.current?.elementIds() ?? [])].filter((id) => !over.before.has(id));

  const applyDrawOver = async (instruction: string) => {
    if (!drawOver) return;
    const target = canvas.current?.getBlock(drawOver.blockId);
    const strokes = await canvas.current?.strokesOver(drawOver.blockId, drawOver.before);
    if (!target) return;
    if (!strokes && !instruction) {
      setError("nothing_drawn");
      return;
    }
    setDrawOver(null);
    await startRefine(target, { instruction, strokes }, "draw");
  };

  const cancelDrawOver = () => {
    if (drawOver) canvas.current?.removeElements(newStrokeIds(drawOver));
    setDrawOver(null);
    setError(null);
    setMode("draw");
  };

  /** Block names for menus: "label", or "label 2" when several blocks share it. */
  const labelOf = (id: string) => {
    const blocks = canvas.current?.allBlocks() ?? [];
    const block = blocks.find((b) => b.id === id);
    if (!block) return id;
    const same = blocks.filter((b) => b.data.label === block.data.label);
    return same.length > 1 ? `${block.data.label} ${same.indexOf(block) + 1}` : block.data.label;
  };

  const saveAction = (action: Action | null) => {
    if (!actionFor) return;
    const current = canvas.current?.getBlock(actionFor.id);
    if (current) canvas.current?.updateBlock(actionFor.id, { ...current.data, action });
    setActionFor(null);
    window.setTimeout(() => canvas.current?.select(actionFor.id), 0);
  };

  const busy = mode === "generating" || mode === "refining";
  const stage = state.phase === "working" ? state.stage : "uploading";
  const questions = pendingBlocks.filter((block) => block.data.question);
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
          <Button
            variant="outline"
            disabled={mode !== "draw"}
            onClick={() => setSite(canvas.current?.pageLayout() ?? null)}
          >
            {t("site.open")}
          </Button>
          <Button variant="ghost" onClick={() => setShowSubmissions(true)}>
            {t("submissions.button")}
          </Button>
          <Button
            variant="outline"
            disabled={mode !== "draw" && mode !== "try"}
            onClick={() => setMode(mode === "try" ? "draw" : "try")}
          >
            {mode === "try" ? `■ ${t("try.stop")}` : `▶ ${t("try.start")}`}
          </Button>
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
              locked={busy || mode === "deciding" || mode === "try"}
              onReady={(handle) => {
                canvas.current = handle;
              }}
              onSketchCountChange={setSketchCount}
              onSelectBlock={setSelected}
            />
          </Suspense>
        </div>

        {mode === "try" && canvas.current ? <TryLayer canvas={canvas.current} /> : null}

        {mode === "try" ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4">
            <p className="rounded-full bg-foreground px-5 py-2.5 text-sm text-background shadow-[var(--shadow-soft)]">
              {t("try.hint")}
            </p>
          </div>
        ) : null}

        {busy ? (
          <GenerationLoader
            stage={stage}
            steps={mode === "refining" ? REFINE_STEPS : GENERATION_STEPS}
          />
        ) : null}

        {error && !busy ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4">
            <p
              role="alert"
              className="pointer-events-auto rounded-full bg-card px-5 py-2.5 text-sm text-danger shadow-[var(--shadow-soft)]"
            >
              {t(errorKey)}
            </p>
          </div>
        ) : null}

        {mode === "deciding" && questions.length > 0 ? (
          <div className="absolute inset-x-0 top-4 z-40 flex justify-center px-4">
            <div className="flex w-full max-w-2xl flex-col gap-2 rounded-[var(--radius-card)] bg-card p-3 shadow-[var(--shadow-soft)] ring-1 ring-border">
              {questions.map((block) =>
                block.data.question ? (
                  <QuestionCard
                    key={block.id}
                    question={block.data.question}
                    onAnswer={(option) => answer(block, option, "deciding")}
                  />
                ) : null,
              )}
            </div>
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center px-4 [&>*]:pointer-events-auto">
          {mode === "deciding" ? (
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
          ) : null}

          {mode === "draw" && selected ? (
            <BlockPanel
              key={selected.id}
              block={selected}
              actionSummary={
                selected.data.action ? describeAction(selected.data.action, labelOf, t) : null
              }
              onAction={() => setActionFor(selected)}
              onRefine={(instruction) => void startRefine(selected, { instruction }, "draw")}
              onDrawOver={() => beginDrawOver(selected)}
              onAnswer={(option) => answer(selected, option, "draw")}
              onStep={(delta) =>
                canvas.current?.updateBlock(selected.id, stepVersion(selected.data, delta))
              }
            />
          ) : null}

          {mode === "drawOver" && drawOver ? (
            <DrawOverBar
              label={drawOver.label}
              onApply={(instruction) => void applyDrawOver(instruction)}
              onCancel={cancelDrawOver}
            />
          ) : null}
        </div>
      </section>

      {actionFor ? (
        <ActionEditor
          block={actionFor}
          targets={(canvas.current?.allBlocks() ?? []).filter((b) => b.id !== actionFor.id)}
          labelOf={labelOf}
          onSave={saveAction}
          onClose={() => setActionFor(null)}
        />
      ) : null}

      {showSubmissions ? <SubmissionsDialog onClose={() => setShowSubmissions(false)} /> : null}

      {site ? <SitePreview layout={site} onClose={() => setSite(null)} /> : null}
    </div>
  );
}
