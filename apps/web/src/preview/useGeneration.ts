import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  fetchGeneration,
  type GenerationRequest,
  type RefineRequest,
  startGeneration,
  startRefine,
} from "@/lib/api";
import type { GenerationJob } from "@/lib/scene";

export type GenerationState =
  | { phase: "idle" }
  | { phase: "working"; stage: string }
  | { phase: "done"; job: GenerationJob }
  | { phase: "failed"; error: string };

const POLL_MS = 1500;
const TIMEOUT_MS = 3 * 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts a generation or block refinement job and polls it until it finishes. */
export function useGeneration() {
  const [state, setState] = useState<GenerationState>({ phase: "idle" });
  const run = useRef(0);

  useEffect(() => {
    return () => {
      run.current += 1; // cancel polling on unmount
    };
  }, []);

  const track = useCallback(async (start: () => Promise<{ id: string }>) => {
    const current = ++run.current;
    const alive = () => run.current === current;
    setState({ phase: "working", stage: "uploading" });
    try {
      const { id } = await start();
      const deadline = Date.now() + TIMEOUT_MS;
      while (alive()) {
        const job = await fetchGeneration(id);
        if (!alive()) return;
        if (job.status === "done") return setState({ phase: "done", job });
        if (job.status === "failed") {
          return setState({ phase: "failed", error: job.error ?? "generic" });
        }
        setState({ phase: "working", stage: job.stage });
        if (Date.now() > deadline) return setState({ phase: "failed", error: "timeout" });
        await sleep(POLL_MS);
      }
    } catch (error) {
      if (!alive()) return;
      const code = error instanceof ApiError ? error.detail : "generic";
      setState({ phase: "failed", error: code });
    }
  }, []);

  const generate = useCallback(
    (request: GenerationRequest) => track(() => startGeneration(request)),
    [track],
  );
  const refine = useCallback(
    (request: RefineRequest) => track(() => startRefine(request)),
    [track],
  );

  return { state, generate, refine };
}
