/** Mirrors apps/api/src/chizma_api/actions/schemas.py: the only things a block can do. */

export type FieldType = "text" | "tel" | "email" | "textarea";

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
}

export interface FormSpec {
  fields: FormField[];
  submit_label: string;
  success_text: string;
  /** Server form id; set when the form is registered. */
  id?: string | null;
}

export type Action =
  | { type: "link"; url: string; new_tab: boolean }
  | { type: "modal"; title: string; text: string; form: FormSpec | null }
  | { type: "toggle"; target_id: string; start_hidden: boolean }
  | { type: "scroll"; target_id: string };

export type ActionType = Action["type"];

export const ACTION_TYPES: ActionType[] = ["link", "modal", "toggle", "scroll"];

const SAFE_URL = /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:\+?[0-9 ()-]{3,30})$/i;

/** Same rule as the server: only web, email and phone links. */
export const isSafeUrl = (url: string) => SAFE_URL.test(url.trim());

export function isValidAction(action: Action, blockIds: ReadonlySet<string>): boolean {
  switch (action.type) {
    case "link":
      return isSafeUrl(action.url);
    case "modal":
      return action.title.trim().length > 0 && (!action.form || action.form.fields.length > 0);
    case "toggle":
    case "scroll":
      return blockIds.has(action.target_id);
  }
}

/** Accepts only well-formed actions from untrusted data (drafts, pasted scenes). */
export function parseAction(value: unknown): Action | null {
  if (!value || typeof value !== "object") return null;
  const a = value as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  switch (a.type) {
    case "link":
      return typeof a.url === "string" && isSafeUrl(a.url)
        ? { type: "link", url: a.url.trim(), new_tab: a.new_tab !== false }
        : null;
    case "modal": {
      const form = a.form as Record<string, unknown> | null | undefined;
      const fields = Array.isArray(form?.fields)
        ? (form.fields as Record<string, unknown>[])
            .filter((f) => typeof f?.name === "string" && /^[a-z][a-z0-9_]{0,30}$/.test(f.name))
            .slice(0, 8)
            .map((f) => ({
              name: f.name as string,
              label: text(f.label, 60),
              type: (["text", "tel", "email", "textarea"].includes(f.type as string)
                ? f.type
                : "text") as FieldType,
              required: f.required !== false,
            }))
        : [];
      return {
        type: "modal",
        title: text(a.title, 80),
        text: text(a.text, 1000),
        form:
          form && fields.length > 0
            ? {
                fields,
                submit_label: text(form.submit_label, 40),
                success_text: text(form.success_text, 200),
                id: typeof form.id === "string" && /^[a-f0-9]{16}$/.test(form.id) ? form.id : null,
              }
            : null,
      };
    }
    case "toggle":
    case "scroll":
      if (typeof a.target_id !== "string" || !/^[\w-]{1,80}$/.test(a.target_id)) return null;
      return a.type === "toggle"
        ? { type: "toggle", target_id: a.target_id, start_hidden: a.start_hidden !== false }
        : { type: "scroll", target_id: a.target_id };
    default:
      return null;
  }
}
