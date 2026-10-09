import { expect, test } from "@playwright/test";
import { API, generateAndAccept, onCanvas, openEditor, selectBlock, shape } from "./helpers";

test("draw, generate in place, accept and keep editing a block", async ({ page }) => {
  await openEditor(page, [
    shape("walls", "rectangle", 100, 260, 160, 130),
    shape("sun", "ellipse", 480, 120, 100, 100, { backgroundColor: "#ffec99" }),
  ]);

  await page.getByRole("button", { name: "Сгенерировать" }).click();
  await expect(page.getByRole("button", { name: /Вернуться к рисунку/ })).toBeVisible();
  await page.getByRole("button", { name: /Принять/ }).click();

  const blocks = await onCanvas<number>(
    page,
    "return api.getSceneElements().filter((e) => e.customData?.chizma).length;",
  );
  expect(blocks).toBe(2);

  await selectBlock(page, "circle");
  await page.getByPlaceholder("Опишите, что изменить…").fill("сделай синим");
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await expect(page.getByText("2 из 2")).toBeVisible();
  const html = await onCanvas<string>(
    page,
    "return api.getSceneElements().find((e) => e.customData?.chizma?.label === 'circle').customData.chizma.html;",
  );
  expect(html).toContain("#1971c2");
});

test("Back to drawing restores the strokes", async ({ page }) => {
  await openEditor(page, [shape("box", "rectangle", 200, 200, 200, 100)]);

  await page.getByRole("button", { name: "Сгенерировать" }).click();
  await page.getByRole("button", { name: /Вернуться к рисунку/ }).click();

  const state = await onCanvas<{ blocks: number; strokeOpacity: number }>(
    page,
    `const els = api.getSceneElements();
     return { blocks: els.filter((e) => e.customData?.chizma).length, strokeOpacity: els.find((e) => e.id === "box").opacity };`,
  );
  expect(state).toEqual({ blocks: 0, strokeOpacity: 100 });
});

test("blocks saved by an older editor do not crash the page", async ({ page }) => {
  const legacy = shape("legacy", "iframe", 300, 200, 120, 120, {
    strokeColor: "#ffffff01",
    backgroundColor: "#ffffff01",
    customData: {
      chizma: {
        elementId: "el_1",
        kind: "illustration",
        label: "circle",
        html: "<svg></svg>",
        css: "",
        locale: "ru",
        pending: false,
      },
      generationData: { status: "done", html: "<!doctype html><p>x</p>" },
    },
  });
  await openEditor(page, [legacy]);

  await selectBlock(page, "circle");

  await expect(page.getByPlaceholder("Опишите, что изменить…")).toBeVisible();
  await expect(page.getByText("Что-то пошло не так")).toBeHidden();
});

test("the page sheet pulls far-away shapes back inside", async ({ page }) => {
  await openEditor(page, [shape("far", "rectangle", 3000, 260, 400, 200)]);
  await onCanvas(page, "api.updateScene({ appState: { selectedElementIds: {} } });");

  await expect
    .poll(() =>
      onCanvas<number>(
        page,
        "const e = api.getSceneElements().find((x) => x.id === 'far'); return e.x + e.width;",
      ),
    )
    .toBe(1280);
});

test("a button opens a form on the site and the request reaches the owner", async ({ page }) => {
  await openEditor(page, [shape("btn", "rectangle", 100, 100, 240, 80)]);
  await generateAndAccept(page);

  await selectBlock(page, "box");
  await page.getByRole("button", { name: "Действие", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Открыть окно" }).click();
  await page.getByPlaceholder("Заголовок окна").fill("Записаться");
  await page.getByLabel("Собирать заявку (форма)").check();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("окно «Записаться»")).toBeVisible();

  await page.getByRole("button", { name: "Открыть как сайт" }).click();
  const site = page.frameLocator('iframe[title="Открыть как сайт"]');
  await site.locator("[data-chz-action]").click();
  await site.getByLabel("Имя").fill("Aziza");
  await site.getByLabel("Телефон").fill("+998901112233");
  await site.getByRole("button", { name: "Отправить" }).click();
  await expect(site.getByText("Спасибо!", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: /Назад к редактору/ }).click();
  await page.getByRole("button", { name: "Заявки" }).click();
  await expect(page.getByRole("dialog").getByText("+998901112233")).toBeVisible();
});

test("Ctrl+click picks a link inside a block and gives it its own action", async ({
  page,
  context,
}) => {
  await context.route("https://example.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>contacts</p>" }),
  );
  const nav = shape("nav", "iframe", 0, 0, 1280, 80, {
    strokeColor: "#ffffff01",
    backgroundColor: "#ffffff01",
    customData: {
      chizma: {
        elementId: "el_1",
        kind: "nav",
        label: "навигация",
        html: '<nav><a href="#">Главная</a><a href="#">Услуги</a><a href="#">Контакты</a><button type="button">Связаться</button></nav>',
        css: "nav{display:flex;align-items:center;gap:48px;height:100%;padding:0 32px;font-size:20px}",
        locale: "ru",
        pending: false,
      },
    },
  });
  await openEditor(page, [nav]);
  await onCanvas(page, "api.scrollToContent(undefined, { fitToViewport: false });");

  // Find the link where the block is drawn, then Ctrl+click it on the canvas.
  const block = page.frameLocator(".excalidraw iframe");
  const link = await block.getByText("Контакты").boundingBox();
  if (!link) throw new Error("the block is not rendered");
  await page.keyboard.down("Control");
  await page.mouse.click(link.x + link.width / 2, link.y + link.height / 2);
  await page.keyboard.up("Control");

  await expect(page.getByRole("button", { name: "Контакты", pressed: true })).toBeVisible();
  await page.getByRole("button", { name: "Действие: Контакты" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Перейти по ссылке" }).click();
  await page
    .getByPlaceholder("Адрес (https://…, mailto:, tel:)")
    .fill("https://example.com/contacts");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("example.com/contacts")).toBeVisible();

  // The other links keep no action; the site runs exactly this one.
  await page.getByRole("button", { name: "Весь блок" }).click();
  await expect(page.getByText("Без действия")).toBeVisible();
  await page.getByRole("button", { name: "Открыть как сайт" }).click();
  const site = page.frameLocator('iframe[title="Открыть как сайт"]');
  const opened = context.waitForEvent("page");
  await site.getByText("Контакты").click();
  await (await opened).waitForURL("https://example.com/contacts");
});

test("the site adapts to phones automatically", async ({ page }) => {
  await openEditor(page, [
    shape("a", "rectangle", 100, 100, 300, 120),
    shape("b", "ellipse", 700, 100, 200, 200, { backgroundColor: "#ffec99" }),
  ]);
  await generateAndAccept(page);
  await page.getByRole("button", { name: "Открыть как сайт" }).click();
  await page.getByRole("button", { name: "Телефон" }).click();

  const site = page.frameLocator('iframe[title="Открыть как сайт"]');
  const cells = site.locator(".chz-cell");
  await expect(cells).toHaveCount(2);
  const [first, second] = [await cells.nth(0).boundingBox(), await cells.nth(1).boundingBox()];
  expect(second && first && second.y > first.y + first.height - 1).toBe(true);
});

test("the API is up for the editor", async ({ request }) => {
  expect((await request.get(`${API}/health`)).ok()).toBe(true);
});
