import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Action, isSafeUrl } from "@/actions/types";
import { actionsOf } from "@/canvas/blocks";
import { cachedPartRects, partRects } from "@/canvas/partProbe";
import { hitPart, type PartRect } from "@/canvas/parts";
import type { BlockPoint, CanvasHandle } from "@/canvas/SketchCanvas";
import { submitForm } from "@/lib/api";
import { Dialog, inputClass } from "./Dialog";
import { Button } from "./ui/button";

type ModalAction = Extract<Action, { type: "modal" }>;

/**
 * "Try" mode: the canvas is frozen and this transparent layer catches clicks, finds the block
 * (and the link/button inside it) under the pointer and runs its action with the editor's own,
 * audited code. Generated block code never runs here.
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
      for (const action of actionsOf(block.data)) {
        if (action.type === "toggle" && action.start_hidden && !touched.has(action.target_id)) {
          touched.add(action.target_id);
          canvas.setVisible(action.target_id, false);
        }
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
        // Never navigate the editor itself: always a new tab, and only web/mail/phone links.
        if (isSafeUrl(action.url)) window.open(action.url, "_blank", "noopener,noreferrer");
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
        onPointerMove={(e) => {
          const hit = canvas.pointAt(e.clientX, e.clientY);
          if (!hit) return setHovering(false);
          const { data, width, height } = hit.block;
          setHovering(Boolean(actionAt(hit, cachedPartRects(data, width, height) ?? [])));
        }}
        onClick={async (e) => {
          const hit = canvas.pointAt(e.clientX, e.clientY);
          if (!hit) return;
          const { data, width, height } = hit.block;
          const action = actionAt(hit, await partRects(data, width, height));
          if (action) run(action);
        }}
      />
      {modal ? <TryModal action={modal} onClose={() => setModal(null)} /> : null}
    </>
  );
}

/** The clicked link/button's own action, else the block's. */
function actionAt(hit: BlockPoint, rects: readonly PartRect[]): Action | null {
  const { data } = hit.block;
  const part = hitPart(rects, hit.x, hit.y, 0);
  return (part ? data.partActions[part] : undefined) ?? data.action;
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
