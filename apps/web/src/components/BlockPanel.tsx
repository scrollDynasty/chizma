import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BlockQuestion } from "@/canvas/blocks";
import type { Part } from "@/canvas/parts";
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
  /** Links and buttons inside the block, and the one picked (null = the whole block). */
  parts: readonly Part[];
  activePart: string | null;
  onPickPart: (partId: string | null) => void;
  /** Short description of the picked subject's action, or null. */
  actionSummary: string | null;
  onAction: () => void;
  onRefine: (instruction: string) => void;
  onDrawOver: () => void;
  onAnswer: (option: string) => void;
  onStep: (delta: number) => void;
}

const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active ? "bg-foreground text-background" : "bg-muted hover:bg-border"
  }`;

/**
 * Shown when one generated block is selected: its action (or that of a link/button inside it),
 * change it in words, draw over it, versions.
 */
export function BlockPanel({
  block,
  parts,
  activePart,
  onPickPart,
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
  const part = parts.find((p) => p.id === activePart) ?? null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!instruction.trim()) return;
    onRefine(instruction.trim());
    setInstruction("");
  };

  return (
    <div className={`${panel} w-full max-w-2xl`}>
      {data.question ? <QuestionCard question={data.question} onAnswer={onAnswer} /> : null}
      {parts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" title={t("block.partHint")}>
          <span className="text-xs text-muted-foreground">{t("block.parts")}</span>
          <button
            type="button"
            className={chip(part === null)}
            aria-pressed={part === null}
            onClick={() => onPickPart(null)}
          >
            {t("block.wholeBlock")}
          </button>
          {parts.map((p) => (
            <button
              key={p.id}
              type="button"
              className={chip(p.id === part?.id)}
              aria-pressed={p.id === part?.id}
              onClick={() => onPickPart(p.id)}
            >
              {p.label}
              {data.partActions[p.id] ? (
                <span aria-hidden="true" className="ml-1 text-accent">
                  ●
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="outline" onClick={onAction}>
          {part ? `${t("action.button")}: ${part.label}` : t("action.button")}
        </Button>
        <span className="min-w-0 truncate text-sm text-muted-foreground">
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
          className="h-10 min-w-0 flex-1 basis-56 rounded-full border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-accent"
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
