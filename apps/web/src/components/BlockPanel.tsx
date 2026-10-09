import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BlockQuestion } from "@/canvas/blocks";
import type { SelectedBlock } from "@/canvas/SketchCanvas";
import { Button } from "./ui/button";

const panel =
  "flex flex-col gap-2 rounded-[var(--radius-card)] bg-card p-3 shadow-[var(--shadow-soft)] ring-1 ring-border";

/** A clarifying question from the model, answered with one tap. */
export function QuestionCard({
  question,
  onAnswer,
  disabled,
}: {
  question: BlockQuestion;
  onAnswer: (option: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{question.text}</span>
      {question.options.map((option) => (
        <Button key={option} variant="outline" disabled={disabled} onClick={() => onAnswer(option)}>
          {option}
        </Button>
      ))}
    </div>
  );
}

interface BlockPanelProps {
  block: SelectedBlock;
  /** Short description of the block's action, or null. */
  actionSummary: string | null;
  onAction: () => void;
  onRefine: (instruction: string) => void;
  onDrawOver: () => void;
  onAnswer: (option: string) => void;
  onStep: (delta: number) => void;
}

/** Shown when one generated block is selected: change it in words, draw over it, versions. */
export function BlockPanel({
  block,
  actionSummary,
  onAction,
  onRefine,
  onDrawOver,
  onAnswer,
  onStep,
}: BlockPanelProps) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState("");
  const { data } = block;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!instruction.trim()) return;
    onRefine(instruction.trim());
    setInstruction("");
  };

  return (
    <div className={`${panel} w-full max-w-2xl`}>
      {data.question ? <QuestionCard question={data.question} onAnswer={onAnswer} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={onAction}>
          {t("action.button")}
        </Button>
        <span className="truncate text-sm text-muted-foreground">
          {actionSummary ?? t("action.none")}
        </span>
      </div>
      <form className="flex flex-wrap items-center gap-2" onSubmit={submit}>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{data.label}</span>
        <input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder={t("block.placeholder")}
          maxLength={500}
          className="h-10 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
        <Button type="submit" disabled={!instruction.trim()}>
          {t("block.apply")}
        </Button>
        <Button variant="outline" onClick={onDrawOver}>
          {t("block.drawOver")}
        </Button>
        {data.versions.length > 1 ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              aria-label={t("block.previous")}
              disabled={data.current === 0}
              onClick={() => onStep(-1)}
            >
              ‹
            </Button>
            <span>{t("block.version", { n: data.current + 1, total: data.versions.length })}</span>
            <Button
              variant="ghost"
              aria-label={t("block.next")}
              disabled={data.current === data.versions.length - 1}
              onClick={() => onStep(1)}
            >
              ›
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}

interface DrawOverBarProps {
  label: string;
  onApply: (instruction: string) => void;
  onCancel: () => void;
}

/** While drawing over a block: optional words, then Apply or Cancel. */
export function DrawOverBar({ label, onApply, onCancel }: DrawOverBarProps) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState("");

  return (
    <form
      className={`${panel} w-full max-w-2xl`}
      onSubmit={(event) => {
        event.preventDefault();
        onApply(instruction.trim());
      }}
    >
      <p className="text-sm font-medium">{t("block.drawHint", { label })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder={t("block.placeholder")}
          maxLength={500}
          className="h-10 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
        <Button variant="ghost" onClick={onCancel}>
          {t("block.cancel")}
        </Button>
        <Button type="submit">{t("block.applyDrawing")}</Button>
      </div>
    </form>
  );
}
