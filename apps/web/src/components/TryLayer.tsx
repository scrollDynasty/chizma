import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Action } from "@/actions/types";
import type { CanvasHandle } from "@/canvas/SketchCanvas";
import { submitForm } from "@/lib/api";
import { Dialog, inputClass } from "./Dialog";
import { Button } from "./ui/button";

type ModalAction = Extract<Action, { type: "modal" }>;

/**
 * "Try" mode: the canvas is frozen and this transparent layer catches clicks, finds the block
 * under the pointer and runs its action with the editor's own, audited code. Generated block
 * code never runs here.
 */
export function TryLayer({ canvas }: { canvas: CanvasHandle }) {
  const { t } = useTranslation();
  const [modal, setModal] = useState<ModalAction | null>(null);
  const [hovering, setHovering] = useState(false);
  const hidden = useRef(new Set<string>());

  // Blocks that a toggle shows "later" start hidden, like on the published site.
  useEffect(() => {
    const touched = hidden.current;
    for (const block of canvas.allBlocks()) {
      const action = block.data.action;
      if (action?.type === "toggle" && action.start_hidden && !touched.has(action.target_id)) {
        touched.add(action.target_id);
        canvas.setVisible(action.target_id, false);
      }
    }
    return () => {
      for (const id of touched) canvas.setVisible(id, true);
      touched.clear();
    };
  }, [canvas]);

  const run = (action: Action) => {
    switch (action.type) {
      case "link":
        window.open(action.url, action.new_tab ? "_blank" : "_self", "noopener,noreferrer");
        return;
      case "modal":
        setModal(action);
        return;
      case "toggle": {
        const isHidden = hidden.current.has(action.target_id);
        if (isHidden) hidden.current.delete(action.target_id);
        else hidden.current.add(action.target_id);
        canvas.setVisible(action.target_id, isHidden);
        return;
      }
      case "scroll":
        canvas.scrollTo(action.target_id);
        return;
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label={t("try.hint")}
        className="absolute inset-0 z-30 bg-transparent"
        style={{ cursor: hovering ? "pointer" : "default" }}
        onPointerMove={(e) =>
          setHovering(Boolean(canvas.blockAt(e.clientX, e.clientY)?.data.action))
        }
        onClick={(e) => {
          const action = canvas.blockAt(e.clientX, e.clientY)?.data.action;
          if (action) run(action);
        }}
      />
      {modal ? <TryModal action={modal} onClose={() => setModal(null)} /> : null}
    </>
  );
}

function TryModal({ action, onClose }: { action: ModalAction; onClose: () => void }) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const form = action.form;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!form?.id) return;
    setState("sending");
    try {
      await submitForm(form.id, values);
      setState("sent");
    } catch {
      setState("error");
    }
  };

  return (
    <Dialog title={action.title} onClose={onClose}>
      {action.text ? <p className="text-sm whitespace-pre-line">{action.text}</p> : null}
      {form && state === "sent" ? (
        <p className="text-sm text-success">{form.success_text}</p>
      ) : null}
      {form && state !== "sent" ? (
        <form className="flex flex-col gap-3" onSubmit={send}>
          {form.fields.map((field) => {
            const id = `chz-field-${field.name}`;
            const change = (value: string) => setValues((v) => ({ ...v, [field.name]: value }));
            return (
              <div key={field.name} className="flex flex-col gap-1 text-sm">
                <label htmlFor={id}>{field.label}</label>
                {field.type === "textarea" ? (
                  <textarea
                    id={id}
                    className={`${inputClass} h-20 py-2`}
                    required={field.required}
                    onChange={(e) => change(e.target.value)}
                  />
                ) : (
                  <input
                    id={id}
                    className={inputClass}
                    type={field.type}
                    required={field.required}
                    onChange={(e) => change(e.target.value)}
                  />
                )}
              </div>
            );
          })}
          {state === "error" ? (
            <p className="text-sm text-danger">{t("gen.errors.generic")}</p>
          ) : null}
          <Button type="submit" disabled={state === "sending"}>
            {form.submit_label}
          </Button>
        </form>
      ) : null}
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          {t("modal.close")}
        </Button>
      </div>
    </Dialog>
  );
}
