import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export const GENERATION_STEPS = ["uploading", "recognizing", "building"];
export const REFINE_STEPS = ["uploading", "refining"];

/** Covers the canvas while a generation runs: the drawing is frozen and the steps are shown. */
export function GenerationLoader({
  stage,
  steps = GENERATION_STEPS,
}: {
  stage: string;
  steps?: readonly string[];
}) {
  const { t } = useTranslation();
  const current = Math.max(0, steps.indexOf(stage));

  return (
    <div className="chz-loader absolute inset-0 z-50 grid place-items-center bg-background/55 backdrop-blur-[3px]">
      <div
        role="status"
        aria-live="polite"
        className="flex w-72 flex-col gap-4 rounded-[var(--radius-card)] bg-card p-6 shadow-[var(--shadow-soft)] ring-1 ring-border"
      >
        <div className="chz-orb mx-auto" aria-hidden="true" />
        <ol className="flex flex-col gap-2.5">
          {steps.map((step, index) => (
            <li
              key={step}
              className={cn(
                "flex items-center gap-3 text-sm transition-colors",
                index < current && "text-muted-foreground",
                index === current && "font-medium text-foreground",
                index > current && "text-muted-foreground/50",
              )}
            >
              <span className="grid size-5 place-items-center" aria-hidden="true">
                {index < current ? (
                  <span className="text-success">✓</span>
                ) : index === current ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>
              {t(`gen.stage.${step}`)}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
