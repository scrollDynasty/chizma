import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, useRef, useState } from "react";
import { type Draft, loadDraft, saveDraft } from "./draft";
import { type SketchBounds, type SketchShape, simplifyShapes, visibleElements } from "./shapes";

export interface Snapshot {
  png: Blob;
  shapes: SketchShape[];
  bounds: SketchBounds;
}

export interface CanvasHandle {
  snapshot: () => Promise<Snapshot | null>;
}

interface Props {
  langCode: string;
  onReady: (handle: CanvasHandle) => void;
  onElementCountChange: (count: number) => void;
}

/** Longest side sent to the vision model; larger images are downscaled anyway. */
const MAX_IMAGE_SIDE = 1568;
const SAVE_DELAY_MS = 800;

export default function SketchCanvas({ langCode, onReady, onElementCountChange }: Props) {
  const [initial, setInitial] = useState<Draft | null | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void loadDraft().then(setInitial);
    return () => window.clearTimeout(saveTimer.current);
  }, []);

  if (initial === undefined) return null;

  const attach = (api: ExcalidrawImperativeAPI) => {
    onReady({
      snapshot: async () => {
        const elements = api.getSceneElements();
        const { bounds, shapes } = simplifyShapes(elements);
        if (!bounds) return null;
        const png = await exportToBlob({
          elements,
          files: api.getFiles(),
          appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
          mimeType: "image/png",
          maxWidthOrHeight: MAX_IMAGE_SIDE,
          exportPadding: 16,
        });
        return { png, shapes, bounds };
      },
    });
  };

  const handleChange = (
    elements: readonly NonDeletedExcalidrawElement[],
    _: unknown,
    files: BinaryFiles,
  ) => {
    onElementCountChange(visibleElements(elements).length);
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
