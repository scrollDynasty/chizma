import { del, get, set } from "idb-keyval";
import type { GenerationJob } from "@/lib/scene";

/** The accepted generation, kept in this browser until sites are stored on the server (M4). */
const SITE_KEY = "chizma.site.v1";

export interface Stage {
  width: number;
  height: number;
}

/** A generation as shown on screen: the job plus the canvas size it was laid out for. */
export interface GeneratedSite {
  job: GenerationJob;
  stage: Stage;
}

export interface AcceptedSite extends GeneratedSite {
  acceptedAt: number;
}

export async function loadAcceptedSite(): Promise<AcceptedSite | null> {
  try {
    return (await get<AcceptedSite>(SITE_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function saveAcceptedSite(site: GeneratedSite): Promise<void> {
  try {
    await set(SITE_KEY, { ...site, acceptedAt: Date.now() } satisfies AcceptedSite);
  } catch {
    // storage unavailable: the result stays on screen but is not remembered
  }
}

export async function clearAcceptedSite(): Promise<void> {
  try {
    await del(SITE_KEY);
  } catch {
    // ignore
  }
}
