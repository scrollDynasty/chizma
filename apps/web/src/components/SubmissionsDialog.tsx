import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type FormInfo, listForms, listSubmissions } from "@/lib/api";
import { Dialog } from "./Dialog";
import { Button } from "./ui/button";

/** Requests collected by the forms on your blocks. */
export function SubmissionsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const forms = useQuery({ queryKey: ["forms"], queryFn: ({ signal }) => listForms(signal) });

  return (
    <Dialog title={t("submissions.title")} onClose={onClose}>
      {forms.data && forms.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("submissions.empty")}</p>
      ) : null}
      {(forms.data ?? []).map((form) => (
        <FormSubmissions key={form.id} form={form} />
      ))}
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          {t("modal.close")}
        </Button>
      </div>
    </Dialog>
  );
}

function FormSubmissions({ form }: { form: FormInfo }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(form.submissions > 0);
  const rows = useQuery({
    queryKey: ["submissions", form.id],
    queryFn: ({ signal }) => listSubmissions(form.id, signal),
    enabled: open,
  });

  return (
    <section className="flex flex-col gap-2 rounded-lg bg-muted p-3">
      <button
        type="button"
        className="flex items-center justify-between text-left text-sm font-medium"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{form.name}</span>
        <span className="text-xs text-muted-foreground">
          {t("submissions.count", { count: form.submissions })}
        </span>
      </button>
      {open && rows.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("submissions.none")}</p>
      ) : null}
      {open
        ? rows.data?.map((row) => (
            <div key={row.id} className="rounded-md bg-card p-2 text-sm">
              <div className="text-xs text-muted-foreground">
                {new Date(`${row.created_at}Z`).toLocaleString()}
              </div>
              {form.fields.map((field) =>
                row.data[field.name] ? (
                  <div key={field.name}>
                    <span className="text-muted-foreground">{field.label}: </span>
                    {row.data[field.name]}
                  </div>
                ) : null,
              )}
            </div>
          ))
        : null}
    </section>
  );
}
