import type { TFunction } from "i18next";
import type { Action } from "./types";

/** One short line for the block panel, e.g. "window “Booking”". */
export function describeAction(action: Action, labelOf: (id: string) => string, t: TFunction) {
  switch (action.type) {
    case "link":
      return t("action.summary.link", { url: action.url.replace(/^https?:\/\//, "") });
    case "modal":
      return t("action.summary.modal", { title: action.title });
    case "toggle":
      return t("action.summary.toggle", { target: labelOf(action.target_id) });
    case "scroll":
      return t("action.summary.scroll", { target: labelOf(action.target_id) });
  }
}
