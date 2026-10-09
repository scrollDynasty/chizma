import { del, get, set } from "idb-keyval";

/** The drawing is kept only in this browser (IndexedDB) during the test phase. */
const DRAFT_KEY = "chizma.draft.v1";

export interface Draft {
  elements: readonly unknown[];
  files: Record<string, unknown>;
  savedAt: number;
}

export async function loadDraft(): Promise<Draft | null> {
  try {
    return (await get<Draft>(DRAFT_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function saveDraft(draft: Draft): Promise<void> {
  try {
    await set(DRAFT_KEY, draft);
  } catch {
    // storage unavailable or full: drawing still works, it just won't survive a reload
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await del(DRAFT_KEY);
  } catch {
    // ignore
  }
}
