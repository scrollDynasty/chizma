import {
  CaptureUpdateAction,
  Excalidraw,
  exportToBlob,
  newElementWith,
  restoreElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, useRef, useState } from "react";
import type { GenerationJob } from "@/lib/scene";
import { buildBlockDocument } from "@/preview/blockDocument";
import { sanitizeBlockHtml, withCsp } from "@/preview/sandbox";
import { type BlockData, isBlock } from "./blocks";
import { type Draft, loadDraft, saveDraft } from "./draft";
import {
  acceptResult,
  discardResult,
  insertResult,
  type SceneItem,
  type Update,
} from "./resultOps";
import { type SketchBounds, type SketchShape, simplifyShapes, visibleElements } from "./shapes";

export interface Snapshot {
  png: Blob;
  shapes: SketchShape[];
  /** The visible canvas in scene coordinates: the frame the result is placed in. */
  bounds: SketchBounds;
}

export interface CanvasHandle {
  /** Sketch strokes only; blocks that were already generated are left out. */
  snapshot: () => Promise<Snapshot | null>;
  /** Put a generated result on the canvas (pending) in place of its strokes. */
  showResult: (job: GenerationJob, frame: SketchBounds, locale: string) => void;
  /** Keep the pending result; it becomes ordinary, editable canvas content. */
  acceptResult: () => void;
  /** Remove the pending result and show the original strokes again. */
  discardResult: () => void;
}

interface Props {
  langCode: string;
  /** View-only while generating or deciding: nothing can be moved. */
  locked: boolean;
  onReady: (handle: CanvasHandle) => void;
  /** Number of sketch strokes that can still be generated. */
  onSketchCountChange: (count: number) => void;
}

/** Longest side sent to the vision model; larger images are downscaled anyway. */
const MAX_IMAGE_SIDE = 1568;
const SAVE_DELAY_MS = 800;

const update: Update = (element, patch) =>
  newElementWith(
    element as unknown as ExcalidrawElement,
    patch as never,
  ) as unknown as typeof element;

/** Sanitised (DOMPurify) and CSP-locked document for one block. */
const renderBlock = (data: BlockData) => withCsp(buildBlockDocument(data, sanitizeBlockHtml));

const isSketch = (element: ExcalidrawElement) => !element.isDeleted && !isBlock(element);

export default function SketchCanvas({ langCode, locked, onReady, onSketchCountChange }: Props) {
  const [initial, setInitial] = useState<Draft | null | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void loadDraft().then((draft) => {
      if (!draft) return setInitial(null);
      // A result left undecided (tab closed) goes back to the drawing.
      const elements = discardResult(draft.elements as SceneItem[], (e, p) => ({ ...e, ...p }));
      setInitial({ ...draft, elements: elements.filter((e) => !e.isDeleted) });
    });
    return () => window.clearTimeout(saveTimer.current);
  }, []);

  if (initial === undefined) return null;

  const replaceScene = (elements: readonly unknown[], undoable: boolean) => ({
    elements: restoreElements(elements as ExcalidrawElement[], null),
    captureUpdate: undoable ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.NEVER,
  });

  const attach = (api: ExcalidrawImperativeAPI) => {
    const current = () => api.getSceneElementsIncludingDeleted() as unknown as SceneItem[];
    onReady({
      snapshot: async () => {
        const sketch = api.getSceneElements().filter(isSketch);
        // The visible canvas is the page frame: the result lands exactly where you drew.
        const view = api.getAppState();
        const frame = {
          x: -view.scrollX,
          y: -view.scrollY,
          width: view.width / view.zoom.value,
          height: view.height / view.zoom.value,
        };
        const { bounds, shapes } = simplifyShapes(sketch, frame);
        if (!bounds || shapes.length === 0) return null;
        const png = await exportToBlob({
          elements: sketch,
          files: api.getFiles(),
          appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
          mimeType: "image/png",
          maxWidthOrHeight: MAX_IMAGE_SIDE,
          exportPadding: 16,
        });
        return { png, shapes, bounds };
      },
      showResult: (job, frame, locale) => {
        const { elements } = insertResult(current(), job, frame, locale, update, renderBlock);
        api.updateScene(replaceScene(elements, false));
      },
      acceptResult: () => {
        api.updateScene(replaceScene(acceptResult(current(), update), true));
      },
      discardResult: () => {
        api.updateScene(replaceScene(discardResult(current(), update), false));
      },
    });
  };

  const handleChange = (
    elements: readonly NonDeletedExcalidrawElement[],
    _: unknown,
    files: BinaryFiles,
  ) => {
    onSketchCountChange(visibleElements(elements).filter(isSketch).length);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveDraft({ elements, files, savedAt: Date.now() });
    }, SAVE_DELAY_MS);
  };

  return (
    <Excalidraw
      excalidrawAPI={attach}
      initialData={{
        elements: (initial?.elements ?? []) as NonDeletedExcalidrawElement[],
        files: (initial?.files ?? {}) as BinaryFiles,
        appState: { viewBackgroundColor: "#ffffff" },
        scrollToContent: true,
      }}
      onChange={handleChange}
      langCode={langCode}
      viewModeEnabled={locked}
      UIOptions={{
        canvasActions: {
          loadScene: false,
          saveToActiveFile: false,
          export: false,
          saveAsImage: false,
        },
      }}
    />
  );
}
