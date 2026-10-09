/** Mirrors apps/api/src/chizma_api/generation/schemas.py (schema_version 0.1). */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneElement {
  id: string;
  kind: string;
  label: string;
  intent: string;
  bbox: BBox;
  confidence: number;
  parent_id: string | null;
  source_shape_ids: string[];
  text: string | null;
  style_hints: { colors: string[]; shape: string; notes: string };
  alternatives: { kind: string; label: string; confidence: number }[];
}

export interface SceneGraph {
  schema_version: "0.1";
  page: { title: string; locale: string; palette: string[]; mood: string };
  elements: SceneElement[];
  questions: { element_id: string; text: string; options: string[] }[];
}

export interface Block {
  element_id: string;
  html: string;
  css: string;
}

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface GenerationJob {
  id: string;
  status: JobStatus;
  stage: string;
  scene: SceneGraph | null;
  blocks: Block[];
  error: string | null;
}

export const LOW_CONFIDENCE = 0.6;
