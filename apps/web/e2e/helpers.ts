import { expect, type Page } from "@playwright/test";

export const API = "http://localhost:8010";

const BASE = {
  angle: 0,
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  fillStyle: "solid",
  seed: 1,
  version: 1,
  versionNonce: 1,
  isDeleted: false,
  groupIds: [],
  frameId: null,
  boundElements: null,
  link: null,
  locked: false,
  roundness: null,
};

export function shape(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Record<string, unknown> = {},
) {
  return {
    ...BASE,
    id,
    type,
    x,
    y,
    width,
    height,
    strokeColor: "#1e1e1e",
    backgroundColor: "#a5d8ff",
    ...extra,
  };
}

/** Sign in through the test-only endpoint and open the editor with a given drawing. */
export async function openEditor(page: Page, elements: unknown[], login = `e2e-${Date.now()}`) {
  await page.goto("./");
  await page.evaluate(
    async ({ api, login, elements }) => {
      const response = await fetch(`${api}/v1/auth/test-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login }),
      });
      localStorage.setItem("chizma.token", (await response.json()).access_token);
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("keyval-store");
        request.onupgradeneeded = () => request.result.createObjectStore("keyval");
        request.onsuccess = () => {
          const tx = request.result.transaction("keyval", "readwrite");
          tx.objectStore("keyval").put(
            { elements, files: {}, savedAt: Date.now() },
            "chizma.draft.v1",
          );
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    },
    { api: API, login, elements },
  );
  await page.goto("./new");
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __chizmaCanvas?: unknown }).__chizmaCanvas),
  );
}

/** Run something against the Excalidraw API exposed in dev builds. */
export function onCanvas<T>(page: Page, fn: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    ({ fn, arg }) => {
      const api = (window as unknown as { __chizmaCanvas: unknown }).__chizmaCanvas;
      return new Function("api", "arg", fn)(api, arg);
    },
    { fn, arg },
  ) as Promise<T>;
}

export async function generateAndAccept(page: Page) {
  await page.getByRole("button", { name: "Сгенерировать" }).click();
  await page.getByRole("button", { name: /Принять/ }).click();
  await expect(page.getByRole("button", { name: /Принять/ })).toBeHidden();
}

export async function selectBlock(page: Page, label: string) {
  await onCanvas(
    page,
    `const el = api.getSceneElements().find((e) => e.customData?.chizma?.label === arg);
     api.updateScene({ appState: { selectedElementIds: { [el.id]: true } } });`,
    label,
  );
}
