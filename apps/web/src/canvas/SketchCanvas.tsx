import {
  CaptureUpdateAction,
  Excalidraw,
  exportToBlob,
  newElementWith,
  restoreElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, useRef, useState } from "react";
import type { GenerationJob } from "@/lib/scene";
import { buildBlockDocument } from "@/preview/blockDocument";
import { sanitizeBlockHtml, withCsp } from "@/preview/sandbox";
import { type BlockData, blockDataOf, isBlock } from "./blocks";
import { type Draft, loadDraft, saveDraft } from "./draft";
import { fitToPage, isPage, newPage } from "./page";
import {
  acceptResult,
  discardResult,
  insertResult,
  type SceneItem,
  type Update,
} from "./resultOps";
import {
  boundsOf,
  overlaps,
  type SketchBounds,
  type SketchShape,
  simplifyShapes,
  visibleElements,
} from "./shapes";

export interface Snapshot {
  png: Blob;
  shapes: SketchShape[];
  /** The visible canvas in scene coordinates: the frame the result is placed in. */
  bounds: SketchBounds;
}

/** A generated block picked on the canvas. */
export interface SelectedBlock {
  id: string;
  data: BlockData;
  width: number;
  height: number;
}

/** Strokes drawn over a block, ready to send for a refinement. */
export interface StrokesOver {
  png: Blob;
  shapes: SketchShape[];
  ids: string[];
}

export interface CanvasHandle {
  /** Sketch strokes only; blocks that were already generated are left out. */
  snapshot: () => Promise<Snapshot | null>;
  /** Put a generated result on the canvas (pending) in place of its strokes. */
  showResult: (job: GenerationJob, frame: SketchBounds, locale: string) => SelectedBlock[];
  /** Keep the pending result; it becomes ordinary, editable canvas content. */
  acceptResult: () => void;
  /** Remove the pending result and show the original strokes again. */
  discardResult: () => void;
  /** The block with this canvas id, with its current size. */
  getBlock: (id: string) => SelectedBlock | null;
  /** Replace a block's data (new version, answered question...) and re-render it. Undoable. */
  updateBlock: (id: string, data: BlockData) => void;
  /** Ids of everything on the canvas now, to find strokes drawn after this moment. */
  elementIds: () => Set<string>;
  /** New strokes (not in `before`) drawn over the block, positioned relative to it. */
  strokesOver: (blockId: string, before: Set<string>) => Promise<StrokesOver | null>;
  /** Delete elements, e.g. strokes already applied to a block. */
  removeElements: (ids: readonly string[]) => void;
  /** Select one element (view mode clears the selection while a request runs). */
  select: (id: string) => void;
  /** Every generated block on the canvas, in drawing order. */
  allBlocks: () => SelectedBlock[];
  /** The topmost block under a point on the screen (client coordinates). */
  blockAt: (clientX: number, clientY: number) => SelectedBlock | null;
  /** Show or hide a block for "Try" mode only: not saved in history. */
  setVisible: (id: string, visible: boolean) => void;
  /** Bring a block into view (scroll action). */
  scrollTo: (id: string) => void;
  /** The page and the blocks on it, positioned relative to the page (for "Open as site"). */
  pageLayout: () => PageLayout | null;
}

export interface PageLayout {
  width: number;
  height: number;
  blocks: (SelectedBlock & { x: number; y: number })[];
}

interface Props {
  langCode: string;
  /** View-only while generating or deciding: nothing can be moved. */
  locked: boolean;
  onReady: (handle: CanvasHandle) => void;
  /** Number of sketch strokes that can still be generated. */
  onSketchCountChange: (count: number) => void;
  /** Called when exactly one generated block is selected, or with null. */
  onSelectBlock: (block: SelectedBlock | null) => void;
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

const isSketch = (element: ExcalidrawElement) =>
  !element.isDeleted && !isBlock(element) && !isPage(element);

/** Every drawing starts on a site page; older drafts get one. */
const withPage = (elements: readonly SceneItem[]) =>
  elements.some((e) => isPage(e) && !e.isDeleted)
    ? [...elements]
    : [newPage() as unknown as SceneItem, ...elements];

export default function SketchCanvas({
  langCode,
  locked,
  onReady,
  onSketchCountChange,
  onSelectBlock,
}: Props) {
  const [initial, setInitial] = useState<Draft | null | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const lastSelection = useRef("");
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  useEffect(() => {
    void loadDraft().then((draft) => {
      if (!draft) return setInitial({ elements: withPage([]), files: {}, savedAt: Date.now() });
      // A result left undecided (tab closed) goes back to the drawing.
      const elements = discardResult(draft.elements as SceneItem[], (e, p) => ({ ...e, ...p }));
      setInitial({ ...draft, elements: withPage(elements.filter((e) => !e.isDeleted)) });
    });
    return () => window.clearTimeout(saveTimer.current);
  }, []);

  if (initial === undefined) return null;

  const replaceScene = (elements: readonly unknown[], undoable: boolean) => ({
    elements: restoreElements(elements as ExcalidrawElement[], null),
    captureUpdate: undoable ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.NEVER,
  });

  const attach = (api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    const current = () => api.getSceneElementsIncludingDeleted() as unknown as SceneItem[];
    const page = () => api.getSceneElements().find((e) => isPage(e));
    if (import.meta.env.DEV) {
      // Lets local end-to-end checks add strokes programmatically. Never in production builds.
      (window as unknown as { __chizmaCanvas?: ExcalidrawImperativeAPI }).__chizmaCanvas = api;
    }
    onReady({
      snapshot: async () => {
        const sketch = api.getSceneElements().filter(isSketch);
        // The site page is the frame: results land exactly where they were drawn on it.
        const sheet = page();
        if (!sheet) return null;
        const frame = { x: sheet.x, y: sheet.y, width: sheet.width, height: sheet.height };
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
        const { elements, added } = insertResult(
          current(),
          job,
          frame,
          locale,
          update,
          renderBlock,
        );
        api.updateScene(replaceScene(elements, false));
        return added.map((block) => ({
          id: block.id,
          data: block.customData.chizma,
          width: block.width,
          height: block.height,
        }));
      },
      acceptResult: () => {
        api.updateScene(replaceScene(acceptResult(current(), update), true));
      },
      discardResult: () => {
        api.updateScene(replaceScene(discardResult(current(), update), false));
      },
      getBlock: (id) => {
        const element = api.getSceneElements().find((e) => e.id === id);
        const data = element ? blockDataOf(element) : null;
        return element && data ? { id, data, width: element.width, height: element.height } : null;
      },
      updateBlock: (id, data) => {
        const elements = current().map((element) =>
          element.id === id
            ? update(element, {
                customData: {
                  ...element.customData,
                  chizma: data,
                  generationData: { status: "done", html: renderBlock(data) },
                },
              })
            : element,
        );
        api.updateScene(replaceScene(elements, true));
      },
      elementIds: () => new Set(api.getSceneElementsIncludingDeleted().map((e) => e.id)),
      strokesOver: async (blockId, before) => {
        const elements = api.getSceneElements();
        const block = elements.find((e) => e.id === blockId);
        if (!block) return null;
        const box = { x: block.x, y: block.y, width: block.width, height: block.height };
        const strokes = elements.filter((element) => {
          const rect = boundsOf([element]);
          return !before.has(element.id) && isSketch(element) && rect && overlaps(rect, box);
        });
        if (strokes.length === 0) return null;
        const png = await exportToBlob({
          elements: strokes,
          files: api.getFiles(),
          appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
          mimeType: "image/png",
          maxWidthOrHeight: MAX_IMAGE_SIDE,
          exportPadding: 8,
        });
        const { shapes } = simplifyShapes(strokes, box);
        return { png, shapes, ids: strokes.map((s) => s.id) };
      },
      allBlocks: () =>
        api.getSceneElements().flatMap((element) => {
          const data = blockDataOf(element);
          return data
            ? [{ id: element.id, data, width: element.width, height: element.height }]
            : [];
        }),
      blockAt: (clientX, clientY) => {
        const point = viewportCoordsToSceneCoords({ clientX, clientY }, api.getAppState());
        const hit = [...api.getSceneElements()].reverse().find((element) => {
          if (!isBlock(element) || element.opacity === 0) return false;
          return (
            point.x >= element.x &&
            point.x <= element.x + element.width &&
            point.y >= element.y &&
            point.y <= element.y + element.height
          );
        });
        const data = hit ? blockDataOf(hit) : null;
        return hit && data ? { id: hit.id, data, width: hit.width, height: hit.height } : null;
      },
      setVisible: (id, visible) => {
        const elements = current().map((element) =>
          element.id === id ? update(element, { opacity: visible ? 100 : 0 }) : element,
        );
        api.updateScene(replaceScene(elements, false));
      },
      pageLayout: () => {
        const sheet = page();
        if (!sheet) return null;
        const blocks = api.getSceneElements().flatMap((element) => {
          const data = blockDataOf(element);
          if (!data || element.opacity === 0) return [];
          return [
            {
              id: element.id,
              data,
              width: element.width,
              height: element.height,
              x: element.x - sheet.x,
              y: element.y - sheet.y,
            },
          ];
        });
        return { width: sheet.width, height: sheet.height, blocks };
      },
      scrollTo: (id) => {
        const element = api.getSceneElements().find((e) => e.id === id);
        if (element) api.scrollToContent(element, { animate: true, fitToViewport: false });
      },
      select: (id) => {
        api.updateScene({
          appState: { selectedElementIds: { [id]: true } },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      },
      removeElements: (ids) => {
        const remove = new Set(ids);
        const elements = current().map((element) =>
          remove.has(element.id) ? update(element, { isDeleted: true }) : element,
        );
        api.updateScene(replaceScene(elements, true));
      },
    });
  };

  const handleChange = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    onSketchCountChange(visibleElements(elements).filter(isSketch).length);
    // Keep everything on the page once the person lets go (never mid-gesture).
    const idle =
      !appState.newElement &&
      !appState.isResizing &&
      !appState.isRotating &&
      !appState.selectedElementsAreBeingDragged &&
      !appState.multiElement &&
      appState.cursorButton === "up";
    const api = apiRef.current;
    if (idle && api) {
      const patches = fitToPage(elements);
      if (patches.size > 0) {
        api.updateScene({
          elements: api.getSceneElementsIncludingDeleted().map((element) => {
            const patch = patches.get(element.id);
            return patch ? newElementWith(element, patch) : element;
          }),
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
    }
    const selected = Object.keys(appState.selectedElementIds).filter(
      (id) => appState.selectedElementIds[id],
    );
    const element = selected.length === 1 ? elements.find((e) => e.id === selected[0]) : undefined;
    const data = element ? blockDataOf(element) : null;
    const key = element && data ? `${element.id}:${element.version}` : "";
    if (key !== lastSelection.current) {
      lastSelection.current = key;
      onSelectBlock(
        element && data
          ? { id: element.id, data, width: element.width, height: element.height }
          : null,
      );
    }
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
        appState: { viewBackgroundColor: "#f1f0ee" },
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
