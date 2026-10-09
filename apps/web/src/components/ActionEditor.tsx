import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ACTION_TYPES,
  type Action,
  type ActionType,
  type FieldType,
  type FormField,
  type FormSpec,
  isValidAction,
} from "@/actions/types";
import type { Part } from "@/canvas/parts";
import type { SelectedBlock } from "@/canvas/SketchCanvas";
import { ApiError, createForm, suggestAction } from "@/lib/api";
import { Dialog, inputClass } from "./Dialog";
import { Button } from "./ui/button";

const PRESETS: { name: string; type: FieldType }[] = [
  { name: "name", type: "text" },
  { name: "phone", type: "tel" },
  { name: "email", type: "email" },
  { name: "message", type: "textarea" },
];

interface Props {
  block: SelectedBlock;
  /** A link/button inside the block, or null for the block as a whole. */
  part?: Part | null;
  /** Other blocks that toggle/scroll actions can point at. */
  targets: SelectedBlock[];
  labelOf: (id: string) => string;
  onSave: (action: Action | null) => void;
  onClose: () => void;
}

type Draft = {
  type: ActionType | "none";
  url: string;
  newTab: boolean;
  title: string;
  text: string;
  withForm: boolean;
  fields: string[];
  submitLabel: string;
  successText: string;
  formId: string | null;
  targetId: string;
  startHidden: boolean;
};

function toDraft(action: Action | null, firstTarget: string, t: (k: string) => string): Draft {
  const base: Draft = {
    type: action?.type ?? "none",
    url: "",
    newTab: true,
    title: "",
    text: "",
    withForm: false,
    fields: ["name", "phone"],
    submitLabel: t("action.defaults.submit"),
    successText: t("action.defaults.success"),
    formId: null,
    targetId: firstTarget,
    startHidden: true,
  };
  if (!action) return base;
  switch (action.type) {
    case "link":
      return { ...base, url: action.url, newTab: action.new_tab };
    case "modal":
      return {
        ...base,
        title: action.title,
        text: action.text,
        withForm: action.form !== null,
        fields: action.form?.fields.map((f) => f.name) ?? base.fields,
        submitLabel: action.form?.submit_label ?? base.submitLabel,
        successText: action.form?.success_text ?? base.successText,
        formId: action.form?.id ?? null,
      };
    case "toggle":
      return { ...base, targetId: action.target_id, startHidden: action.start_hidden };
    case "scroll":
      return { ...base, targetId: action.target_id };
  }
}

/**
 * Pick what a block (or one link/button inside it) does, by hand or by describing it; the AI
 * only fills this same form.
 */
export function ActionEditor({ block, part = null, targets, labelOf, onSave, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const current = part ? (block.data.partActions[part.id] ?? null) : block.data.action;
  const name = part ? part.label : block.data.label;
  const [draft, setDraft] = useState<Draft>(() => toDraft(current, targets[0]?.id ?? "", t));
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const fieldsOf = (names: string[]): FormField[] =>
    PRESETS.filter((p) => names.includes(p.name)).map((p) => ({
      name: p.name,
      label: t(`action.presets.${p.name}`),
      type: p.type,
      required: p.name !== "message" && p.name !== "email",
    }));

  const build = (formId: string | null): Action | null => {
    switch (draft.type) {
      case "none":
        return null;
      case "link":
        return { type: "link", url: draft.url.trim(), new_tab: draft.newTab };
      case "modal": {
        const form: FormSpec | null = draft.withForm
          ? {
              fields: fieldsOf(draft.fields),
              submit_label: draft.submitLabel,
              success_text: draft.successText,
              id: formId,
            }
          : null;
        return { type: "modal", title: draft.title.trim(), text: draft.text.trim(), form };
      }
      case "toggle":
        return { type: "toggle", target_id: draft.targetId, start_hidden: draft.startHidden };
      case "scroll":
        return { type: "scroll", target_id: draft.targetId };
    }
  };

  const save = async () => {
    const ids = new Set(targets.map((b) => b.id));
    const action = build(draft.formId);
    if (action && !isValidAction(action, ids)) {
      setError(t("action.invalid"));
      return;
    }
    setBusy(true);
    try {
      if (action?.type === "modal" && action.form && !action.form.id) {
        const form = await createForm(action.title || name, action.form.fields);
        action.form.id = form.id;
      }
      onSave(action);
    } catch {
      setError(t("gen.errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  const suggest = async () => {
    if (!request.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const ref = (b: SelectedBlock) => ({ id: b.id, kind: b.data.kind, label: b.data.label });
      const result = await suggestAction({
        instruction: request.trim(),
        block: part ? { id: block.id, kind: "button", label: part.label } : ref(block),
        targets: targets.map(ref),
        locale: i18n.language,
      });
      setDraft(toDraft(result.action, targets[0]?.id ?? "", t));
      if (!result.action) setError(result.explanation || t("action.none"));
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.detail : "generic";
      setError(t(`gen.errors.${code}`, { defaultValue: t("gen.errors.generic") }));
    } finally {
      setBusy(false);
    }
  };

  const needsTarget = draft.type === "toggle" || draft.type === "scroll";

  return (
    <Dialog title={`${t(part ? "action.partTitle" : "action.title")}: ${name}`} onClose={onClose}>
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={request}
          maxLength={500}
          placeholder={t("action.describe")}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void suggest();
          }}
        />
        <Button variant="outline" disabled={busy || !request.trim()} onClick={suggest}>
          {t("action.suggest")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["none", ...ACTION_TYPES] as const).map((type) => (
          <Button
            key={type}
            variant={draft.type === type ? "primary" : "outline"}
            disabled={(type === "toggle" || type === "scroll") && targets.length === 0}
            onClick={() => set({ type })}
          >
            {type === "none" ? t("action.none") : t(`action.types.${type}`)}
          </Button>
        ))}
      </div>

      {draft.type === "link" ? (
        <div className="flex flex-col gap-2">
          <input
            className={inputClass}
            value={draft.url}
            placeholder={t("action.url")}
            onChange={(e) => set({ url: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.newTab}
              onChange={(e) => set({ newTab: e.target.checked })}
            />
            {t("action.newTab")}
          </label>
        </div>
      ) : null}

      {draft.type === "modal" ? (
        <div className="flex flex-col gap-2">
          <input
            className={inputClass}
            value={draft.title}
            maxLength={80}
            placeholder={t("action.modalTitle")}
            onChange={(e) => set({ title: e.target.value })}
          />
          <textarea
            className={`${inputClass} h-20 py-2`}
            value={draft.text}
            maxLength={1000}
            placeholder={t("action.modalText")}
            onChange={(e) => set({ text: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={draft.withForm}
              onChange={(e) => set({ withForm: e.target.checked })}
            />
            {t("action.withForm")}
          </label>
          {draft.withForm ? (
            <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
              <span className="text-xs text-muted-foreground">{t("action.fields")}</span>
              <div className="flex flex-wrap gap-3">
                {PRESETS.map((preset) => (
                  <label key={preset.name} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.fields.includes(preset.name)}
                      onChange={(e) =>
                        set({
                          fields: e.target.checked
                            ? [...draft.fields, preset.name]
                            : draft.fields.filter((n) => n !== preset.name),
                        })
                      }
                    />
                    {t(`action.presets.${preset.name}`)}
                  </label>
                ))}
              </div>
              <input
                className={inputClass}
                value={draft.submitLabel}
                maxLength={40}
                placeholder={t("action.submitLabel")}
                onChange={(e) => set({ submitLabel: e.target.value })}
              />
              <input
                className={inputClass}
                value={draft.successText}
                maxLength={200}
                placeholder={t("action.successText")}
                onChange={(e) => set({ successText: e.target.value })}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {needsTarget ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("action.target")}
            <select
              className={inputClass}
              value={draft.targetId}
              onChange={(e) => set({ targetId: e.target.value })}
            >
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {labelOf(target.id)}
                </option>
              ))}
            </select>
          </label>
          {draft.type === "toggle" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.startHidden}
                onChange={(e) => set({ startHidden: e.target.checked })}
              />
              {t("action.startHidden")}
            </label>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("block.cancel")}
        </Button>
        <Button disabled={busy} onClick={save}>
          {t("action.save")}
        </Button>
      </div>
    </Dialog>
  );
}
