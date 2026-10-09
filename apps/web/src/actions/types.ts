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
