// Browser smoke test: renders the demo page with stubbed Home Assistant elements
// and exercises flipping, editing, gestures and the editor.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startServer } from "../scripts/serve_demo.mjs";

let server;
let browser;
let baseUrl;

before(async () => {
  ({ server, url: baseUrl } = await startServer(0));
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function openDemo({ technical = true, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 1400 }, ...options });
  const page = await context.newPage();
  const errors = [];
  const failedResources = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResources.push(response.url());
  });
  await page.goto(`${baseUrl}demo/`, { waitUntil: "networkidle" });
  if (technical) {
    await page.locator("#technical-tests").evaluate((element) => { element.open = true; });
    await page.locator("#grid > .cell").last().waitFor();
  }
  return { page, context, errors, failedResources };
}

const card = (page, index) => page.locator("#grid > .cell > pinboard-card").nth(index);

test("demo renders every card without page errors", async () => {
  const { page, context, errors } = await openDemo();
  assert.equal(await page.locator("#grid > .cell > pinboard-card").count(), 20);
  assert.deepEqual(errors, []);
  assert.equal(await card(page, 0).locator(".face.current .title-overlay").innerText(), "Kitchen");
  assert.equal(await card(page, 0).locator(".stage").getAttribute("aria-pressed"), "false");
  await context.close();
});

test("a tap flips the card and a second tap flips it back", async () => {
  const { page, context } = await openDemo();
  const stage = card(page, 0).locator(".stage");
  await stage.click();
  assert.equal(await stage.getAttribute("aria-pressed"), "true");
  await page.waitForTimeout(800);
  await stage.click();
  assert.equal(await stage.getAttribute("aria-pressed"), "false");
  await context.close();
});

test("keyboard flips with Enter and Space", async () => {
  const { page, context } = await openDemo();
  const stage = card(page, 0).locator(".stage");
  await stage.focus();
  await page.keyboard.press("Enter");
  assert.equal(await stage.getAttribute("aria-pressed"), "true");
  await page.keyboard.press("Space");
  assert.equal(await stage.getAttribute("aria-pressed"), "false");
  await context.close();
});

test("notes from an input_text entity can be edited on the card", async () => {
  const { page, context } = await openDemo();
  const fridge = card(page, 1);
  const cur = () => fridge.locator(".face.current");
  await fridge.locator(".stage").click();
  await page.waitForTimeout(800);
  await cur().locator(".edit").click();
  assert.equal(await cur().locator(".note-editor").evaluate((el) => el.classList.contains("visible")), true);
  assert.match(await cur().locator(".counter").innerText(), /characters left/);
  await cur().locator("textarea").fill("Bought the milk.");
  await cur().locator(".save").click();
  await page.waitForFunction(
    () => document.querySelectorAll("#grid > .cell > pinboard-card")[1].shadowRoot.querySelector(".face.current .note-body").innerText.includes("Bought the milk."),
  );
  assert.match(await cur().locator(".note-meta").innerText(), /Updated/);
  // Escape cancels without saving.
  await cur().locator(".edit").click();
  await cur().locator("textarea").fill("discard me");
  await page.keyboard.press("Escape");
  assert.match(await cur().locator(".note-body").innerText(), /Bought the milk\./);
  await context.close();
});

test("hold and double tap run their actions instead of flipping", async () => {
  const { page, context } = await openDemo();
  const actions = card(page, 19);
  await actions.scrollIntoViewIfNeeded();
  const box = await actions.locator(".stage").boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  let events = await page.evaluate(() => window.__events);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "hass-more-info");
  assert.equal(events[0].detail.entityId, "input_text.fridge_note");
  assert.equal(await actions.locator(".stage").getAttribute("aria-pressed"), "false");

  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  await page.waitForTimeout(400);
  events = await page.evaluate(() => window.__events);
  assert.equal(events.length, 2);
  assert.equal(events[1].type, "open");
  assert.equal(events[1].url, "https://example.com");
  assert.equal(await actions.locator(".stage").getAttribute("aria-pressed"), "false");

  // A single tap still flips, after the double-tap window has passed.
  await page.mouse.click(x, y);
  await page.waitForTimeout(400);
  assert.equal(await actions.locator(".stage").getAttribute("aria-pressed"), "true");
  await context.close();
});

test("pictures with notes become a slide sequence with arrows, dots, keys and swipes", async () => {
  const { page, context } = await openDemo();
  const gallery = card(page, 8); // 3 pictures with notes → 6 slides
  const stage = gallery.locator(".stage");
  const cur = () => gallery.locator(".face.current");
  assert.equal(await gallery.locator(".dots button").count(), 6);
  assert.equal(await cur().locator(".title-overlay").innerText(), "Bike");

  await stage.click();                       // → note of the bike
  await page.waitForTimeout(800);
  assert.match(await cur().locator(".note-body").innerText(), /Chain oiled/);
  assert.equal(await stage.getAttribute("aria-pressed"), "true");

  await stage.focus();
  await page.keyboard.press("ArrowRight");   // → second picture (arrows are hidden on note pages)
  await page.waitForTimeout(800);
  assert.equal(await cur().locator(".title-overlay").innerText(), "Garage");
  assert.equal(await gallery.locator(".dots button.active").evaluate((el) => Array.from(el.parentNode.children).indexOf(el)), 2);

  await stage.focus();
  await page.keyboard.press("ArrowLeft");    // back to the bike note
  await page.waitForTimeout(800);
  assert.match(await cur().locator(".note-body").innerText(), /Chain oiled/);

  await gallery.locator(".dots button").nth(5).click(); // last slide: note from the entity
  await page.waitForTimeout(800);
  assert.match(await cur().locator(".note-body").innerText(), /Milk is running low/);

  // Swipe left on the last slide wraps around to the first picture.
  const box = await stage.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.7, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  assert.equal(await cur().locator(".title-overlay").innerText(), "Bike");
  await context.close();
});

test("slides can be pictures and notes in any order, at most ten", async () => {
  const { page, context } = await openDemo();
  const trip = card(page, 9);
  const stage = trip.locator(".stage");
  const cur = () => trip.locator(".face.current");
  assert.equal(await trip.locator(".dots button").count(), 5);
  assert.equal(await cur().locator(".title-overlay").innerText(), "Arrival");
  await stage.click();
  await page.waitForTimeout(800);
  assert.match(await cur().locator(".note-body").innerText(), /Day 1/);
  await stage.click();
  await page.waitForTimeout(800);
  assert.match(await cur().locator(".note-body").innerText(), /Day 2/);
  assert.equal(await trip.locator(".badge span").innerText(), "Photo");
  await stage.click();
  await page.waitForTimeout(800);
  assert.equal(await cur().locator(".title-overlay").innerText(), "Lake");
  assert.equal(await trip.locator(".badge span").innerText(), "Note");

  const error = await page.evaluate(() => {
    const el = document.createElement("pinboard-card");
    try {
      el.setConfig({ type: "custom:pinboard-card", slides: Array.from({ length: 11 }, () => ({ note: "x" })) });
      return "";
    } catch (err) {
      return err.message;
    }
  });
  assert.match(error, /at most 10/);
  await context.close();
});

test("the editor adds and removes pictures", async () => {
  const { page, context } = await openDemo();
  const editor = page.locator("pinboard-card-editor");
  const configs = [];
  await page.evaluate(() => {
    window.__configs = [];
    document.querySelector("pinboard-card-editor").addEventListener("config-changed", (ev) => window.__configs.push(ev.detail.config));
  });
  await editor.locator(".chip.add-image").click();
  let latest = await page.evaluate(() => window.__configs.at(-1));
  assert.equal(latest.slides.length, 2);
  assert.equal(latest.slides[0].image, "./kitchen.jpg");
  assert.equal(latest.slides[0].note_entity, "input_text.fridge_note");
  assert.equal(latest.image, undefined);
  assert.equal(latest.title, "Fridge");
  assert.equal(await editor.locator(".chip.active").innerText(), "2 · Picture");

  await editor.locator(".remove-page").click();
  latest = await page.evaluate(() => window.__configs.at(-1));
  assert.equal(latest.slides, undefined);
  assert.equal(latest.image, "./kitchen.jpg");
  assert.equal(latest.note_entity, "input_text.fridge_note");
  configs.push(latest);
  await context.close();
});

test("fixed-height hosts (sections view) are never overflowed", async () => {
  const { page, context } = await openDemo();
  const sizes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#sections .host")).slice(0, 3).map((host) => {
      const card = host.querySelector("pinboard-card");
      const h = host.getBoundingClientRect();
      const c = card.shadowRoot.querySelector("ha-card").getBoundingClientRect();
      const back = card.shadowRoot.querySelector(".face.current").getBoundingClientRect();
      return { host: [h.width, h.height], card: [c.width, c.height], back: [back.width, back.height] };
    }),
  );
  for (const { host, card: c, back } of sizes) {
    assert.deepEqual(c, host);
    assert.deepEqual(back, host);
  }
  // The note side keeps its footer inside the card and scrolls long text.
  const first = page.locator("#sections pinboard-card").first();
  assert.equal(await first.locator(".face.current .layer-note").evaluate((el) => el.classList.contains("scrollable")), true);
  const footer = await first.locator(".face.current .note-footer").boundingBox();
  const host = await page.locator("#sections .host").first().boundingBox();
  assert.ok(footer.y + footer.height <= host.y + host.height + 0.5);
  await context.close();
});

test("the editor reorders pictures", async () => {
  const { page, context } = await openDemo();
  const editor = page.locator("pinboard-card-editor");
  await page.evaluate(() => {
    window.__configs = [];
    document.querySelector("pinboard-card-editor").addEventListener("config-changed", (ev) => window.__configs.push(ev.detail.config));
  });
  await editor.locator(".chip.add-note").click();
  assert.equal(await editor.locator(".chip.active").innerText(), "2 · Note");
  assert.equal(await editor.locator(".picture").isVisible(), false);
  assert.equal(await editor.locator(".move-left").isVisible(), true);
  assert.equal(await editor.locator(".move-right").isVisible(), false);
  await editor.locator(".move-left").click();
  const latest = await page.evaluate(() => window.__configs.at(-1));
  assert.equal(latest.slides.length, 2);
  assert.equal(latest.slides[0].kind, "note");
  assert.equal(latest.slides[1].image, "./kitchen.jpg");
  assert.equal(await editor.locator(".chip.active").innerText(), "1 · Note");
  assert.equal(await editor.locator(".move-left").isVisible(), false);
  assert.equal(await editor.locator(".move-right").isVisible(), true);
  await context.close();
});

test("layout: grid renders one tile per picture that flips on its own", async () => {
  const { page, context } = await openDemo();
  const tiles = card(page, 10).locator("pinboard-card");
  assert.equal(await tiles.count(), 4);
  assert.equal(await tiles.nth(0).locator(".face.current .title-overlay").innerText(), "Tomatoes");
  await tiles.nth(1).locator(".stage").click();
  await page.waitForTimeout(300);
  assert.equal(await tiles.nth(1).locator(".stage").getAttribute("aria-pressed"), "true");
  assert.equal(await tiles.nth(0).locator(".stage").getAttribute("aria-pressed"), "false");
  assert.match(await tiles.nth(1).locator(".face.current .note-body").innerText(), /Cut back the mint/);
  // Tiles share the fixed height of a sections host.
  const host = await page.locator("#sections .host").nth(3).boundingBox();
  const tile = await page.locator("#sections .host").nth(3).locator("pinboard-card pinboard-card").first().boundingBox();
  assert.ok(tile.y + tile.height <= host.y + host.height + 0.5);
  assert.ok(tile.height > 100);
  await context.close();
});

test("checklists write back to input_text; config notes show read-only boxes", async () => {
  const { page, context } = await openDemo();
  const shopping = card(page, 11);
  const cur = () => shopping.locator(".face.current");
  await page.waitForTimeout(300);
  assert.equal(await cur().locator(".check").count(), 3);
  assert.equal(await cur().locator(".check input").nth(0).isChecked(), true);
  assert.equal(await cur().evaluate((el) => el.classList.contains("sticky")), true);
  await cur().locator(".check input").nth(1).click();
  await page.waitForFunction(() => window.__hassStates?.()["input_text.shopping"].state.includes("- [x] Bread"));
  assert.equal(await shopping.locator(".stage").getAttribute("aria-pressed"), "true"); // still on the note, no flip

  // Checkboxes in a config note are read-only.
  const boiler = card(page, 13);
  await boiler.locator(".stage").click();
  await page.waitForTimeout(800);
  const bc = () => boiler.locator(".face.current");
  assert.match(await bc().locator(".note-body").innerText(), /54\.5 °C/);
  assert.equal(await bc().locator(".check input").nth(0).isDisabled(), true);
  assert.equal(await bc().locator(".check.static").count(), 3);
  await context.close();
});

test("a to-do list page ticks and adds items through the todo services", async () => {
  const { page, context } = await openDemo();
  const todo = card(page, 12);
  await todo.scrollIntoViewIfNeeded();
  const cur = () => todo.locator(".face.current");
  assert.equal(await cur().locator(".layer-note .note-header .title").innerText(), "Shopping list");
  assert.match(await cur().locator(".note-body").innerText(), /Before the weekend/);
  assert.equal(await cur().locator(".checklist").nth(0).locator(".check").count(), 2); // open items first
  assert.match(await cur().locator(".todo-section").innerText(), /Done · 1/i);
  await cur().locator(".checklist").nth(0).locator(".check input").nth(0).click(); // Bread → completed
  await page.waitForFunction(() => window.__todoItems.find((i) => i.summary === "Bread").status === "completed");
  await page.waitForTimeout(200);
  assert.match(await cur().locator(".todo-section").innerText(), /Done · 2/i);
  await cur().locator(".todo-add input").fill("Butter");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__todoItems.some((i) => i.summary === "Butter"));
  await page.waitForTimeout(200);
  assert.equal(await cur().locator(".checklist").nth(0).locator(".check").count(), 2); // Coffee beans + Butter
  assert.equal(await todo.locator(".stage").getAttribute("aria-pressed"), "true"); // still on the note page
  await context.close();
});

test("expired pages are dimmed or hidden, colours and expiry dates show", async () => {
  const { page, context } = await openDemo();
  const boiler = card(page, 13);
  const cur = () => boiler.locator(".face.current");
  assert.equal(await boiler.locator(".dots button").count(), 5);
  await boiler.locator(".dots button").nth(2).click();
  await page.waitForTimeout(800);
  assert.equal(await cur().evaluate((el) => el.classList.contains("expired")), true);
  assert.equal(await cur().locator(".note-tag").innerText(), "EXPIRED");
  await boiler.locator(".dots button").nth(3).click();
  await page.waitForTimeout(800);
  assert.match(await cur().locator(".note-meta").innerText(), /Until/);
  const bg = await cur().evaluate((el) => getComputedStyle(el).getPropertyValue("--pinboard-note-background").trim());
  assert.equal(bg, "#d4f5cd");
  await boiler.locator(".dots button").nth(4).click();
  await page.waitForTimeout(800);
  const text = await cur().evaluate((el) => getComputedStyle(el).getPropertyValue("--pinboard-note-text").trim());
  assert.equal(text, "#ffffff");

  const hidden = await page.evaluate(() => {
    const el = document.createElement("pinboard-card");
    el.setConfig({ type: "custom:pinboard-card", expired_slides: "hide", slides: [{ note: "a" }, { note: "old", expires: "2020-01-01" }, { note: "c" }] });
    document.body.append(el);
    const dots = el.shadowRoot.querySelectorAll(".dots button").length;
    el.remove();
    return dots;
  });
  assert.equal(hidden, 0); // two visible slides → no dots, the expired one is gone
  await context.close();
});

test("markers show labels and entity states, and open more-info", async () => {
  const { page, context } = await openDemo();
  const boiler = card(page, 14);
  await boiler.scrollIntoViewIfNeeded();
  const cur = () => boiler.locator(".face.current");
  assert.equal(await cur().locator(".marker").count(), 3);
  assert.equal(await boiler.locator(".stage").evaluate((el) => el.classList.contains("ken-burns")), true);
  await cur().locator(".marker .pin").nth(1).click();
  assert.equal(await cur().locator(".marker.open").count(), 1);
  assert.match(await cur().locator(".marker.open .marker-label").innerText(), /Pressure gauge · 1\.6 bar/);
  assert.equal(await boiler.locator(".stage").getAttribute("aria-pressed"), "false"); // no flip
  await page.evaluate(() => (window.__events = []));
  await cur().locator(".marker.open .marker-label").click();
  const events = await page.evaluate(() => window.__events);
  assert.equal(events[0]?.type, "hass-more-info");
  assert.equal(events[0]?.detail.entityId, "sensor.pressure");
  assert.match(await cur().locator(".marker").nth(2).locator(".marker-label").evaluate((el) => el.textContent), /Boiler: 54\.5 °C/);
  await context.close();
});

test("a picture from an input_text gets a camera button that uploads and writes back", async () => {
  const { page, context } = await openDemo();
  const door = card(page, 15);
  await door.scrollIntoViewIfNeeded();
  const cur = () => door.locator(".face.current");
  assert.equal(await cur().locator("img").getAttribute("src"), "./workshop.jpg");
  assert.equal(await cur().locator(".camera").isVisible(), true);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), cur().locator(".camera").click()]);
  await chooser.setFiles({ name: "door.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'/>") });
  await page.waitForFunction(() => window.__hassStates?.()["input_text.door_photo"].state.includes("/api/image/serve/demo123/original"));
  await page.waitForTimeout(200);
  assert.equal(await cur().locator("img").getAttribute("src"), "/api/image/serve/demo123/original");
  assert.equal(await door.locator(".stage").getAttribute("aria-pressed"), "false");
  await context.close();
});

test("the editor imports pictures from a media folder, reorders by drag and drop and previews", async () => {
  const { page, context } = await openDemo();
  const editor = page.locator("pinboard-card-editor");
  await page.evaluate(() => {
    window.__configs = [];
    document.querySelector("pinboard-card-editor").addEventListener("config-changed", (ev) => window.__configs.push(ev.detail.config));
  });
  await editor.locator(".import-section > summary").click(); // the section starts collapsed
  await editor.locator(".import-folder").fill("holiday");
  await editor.locator(".import").click();
  await page.waitForFunction(() => window.__configs.length > 0);
  let latest = await page.evaluate(() => window.__configs.at(-1));
  assert.equal(latest.slides.length, 3);
  assert.equal(latest.slides[1].image, "media-source://media_source/local/holiday/a.jpg");
  assert.equal(latest.slides[2].image, "media-source://media_source/local/holiday/b.png");
  assert.match(await editor.locator(".import-status").innerText(), /2 pictures added/);

  // Drag the third chip onto the first.
  const chips = editor.locator(".chips:not(.add-row) .chip");
  await chips.nth(2).dragTo(chips.nth(0));
  latest = await page.evaluate(() => window.__configs.at(-1));
  assert.equal(latest.slides[0].image, "media-source://media_source/local/holiday/b.png");
  assert.equal(latest.slides[1].image, "./kitchen.jpg");

  // The preview card follows the config and plays the animation.
  const preview = editor.locator(".preview-card pinboard-card");
  assert.equal(await preview.count(), 1);
  assert.equal(await preview.locator(".dots button").count(), 4);
  await editor.locator(".play").click();
  await page.waitForTimeout(100);
  assert.equal(await preview.locator(".dots button.active").evaluate((el) => Array.from(el.parentNode.children).indexOf(el)), 1);
  await context.close();
});

test("uploads are scaled down and cropped before they leave the browser", async () => {
  const { page, context } = await openDemo();
  // The helper is bundled, so exercise it through the editor's upload path.
  const editor = page.locator("pinboard-card-editor");
  await page.evaluate(() => {
    window.__uploaded = null;
    const hass = document.querySelector("pinboard-card-editor").hass;
    hass.fetchWithAuth = async (path, init) => {
      const file = init.body.get("file");
      const bitmap = await createImageBitmap(file);
      window.__uploaded = { width: bitmap.width, height: bitmap.height, type: file.type, name: file.name };
      return new Response(JSON.stringify({ id: "scaled" }), { status: 200 });
    };
    document.querySelector("pinboard-card-editor").hass = hass;
  });
  await page.evaluate(() => {
    const ed = document.querySelector("pinboard-card-editor");
    ed.setConfig({ ...ed._config, upload_max_size: 600, upload_crop: true, aspect_ratio: "1:1" });
  });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), editor.locator(".upload").click()]);
  const png = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 3000;
    canvas.height = 1000;
    canvas.getContext("2d").fillRect(0, 0, 3000, 1000);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await chooser.setFiles({ name: "wide.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await page.waitForFunction(() => window.__uploaded !== null);
  const uploaded = await page.evaluate(() => window.__uploaded);
  assert.deepEqual([uploaded.width, uploaded.height, uploaded.type], [600, 600, "image/png"]);
  await context.close();
});

test("audio pages play a memo and offer recording for input_text entities", async () => {
  const { page, context } = await openDemo();
  const memo = card(page, 16);
  await memo.scrollIntoViewIfNeeded();
  const cur = () => memo.locator(".face.current");
  assert.equal(await memo.locator(".dots button").count(), 3);
  assert.equal(await memo.locator(".badge span").innerText(), "Note");
  await memo.locator(".stage").click(); // note
  await page.waitForTimeout(800);
  assert.equal(await memo.locator(".badge span").innerText(), "Audio");
  await memo.locator(".stage").click(); // audio
  await page.waitForTimeout(800);
  assert.equal(await cur().evaluate((el) => el.classList.contains("kind-audio")), true);
  assert.equal(await cur().locator(".audio-title").innerText(), "Voice memo");
  assert.equal(await cur().locator(".audio-play").isVisible(), true);
  await cur().locator(".audio-play").click();
  await page.waitForTimeout(300);
  assert.equal(await cur().locator(".audio-play ha-icon").getAttribute("icon"), "mdi:pause");
  assert.equal(await memo.locator(".stage").getAttribute("aria-pressed"), "false"); // no flip
  await page.waitForTimeout(1200);
  assert.equal(await cur().locator(".audio-play ha-icon").getAttribute("icon"), "mdi:play"); // ended
  assert.match(await cur().locator(".audio-time").innerText(), /0:0\d \/ 0:01/);
  assert.equal(await cur().locator(".record").isVisible(), false);

  const box = card(page, 17);
  await box.scrollIntoViewIfNeeded();
  const bc = () => box.locator(".face.current");
  assert.equal(await bc().evaluate((el) => el.classList.contains("kind-audio")), true);
  assert.match(await bc().locator(".audio-empty").innerText(), /No recording yet/);
  assert.equal(await bc().locator(".record").isVisible(), true);
  await context.close();
});

test("the editor adds audio entries with record and upload controls", async () => {
  const { page, context } = await openDemo();
  const editor = page.locator("pinboard-card-editor");
  await page.evaluate(() => {
    window.__configs = [];
    document.querySelector("pinboard-card-editor").addEventListener("config-changed", (ev) => window.__configs.push(ev.detail.config));
  });
  await editor.locator(".chip.add-audio").click();
  const latest = await page.evaluate(() => window.__configs.at(-1));
  assert.equal(latest.slides[1].kind, "audio");
  assert.equal(await editor.locator(".chip.active").innerText(), "2 · Audio");
  assert.equal(await editor.locator(".audio-editor").isVisible(), true);
  assert.equal(await editor.locator(".picture").isVisible(), false);
  assert.equal(await editor.locator(".record-btn").innerText(), "Record");
  await context.close();
});

test("touches on a multi-page card do not reach dashboard swipe navigation", async () => {
  const { page, context } = await openDemo();
  const result = await page.evaluate(() => {
    const cards = document.querySelectorAll("#grid > .cell > pinboard-card");
    const fire = (card) => card.shadowRoot.querySelector(".stage").dispatchEvent(new TouchEvent("touchstart", { bubbles: true, composed: true }));
    let count = 0;
    const listener = () => count++;
    document.addEventListener("touchstart", listener);
    fire(cards[8]); // six pages: kept inside the card
    const multi = count;
    const single = document.createElement("pinboard-card");
    single.setConfig({ type: "custom:pinboard-card", image: "./kitchen.jpg" });
    document.body.append(single);
    fire(single); // one page: nothing to swipe, so the dashboard may have it
    single.remove();
    document.removeEventListener("touchstart", listener);
    return { multi, single: count === 1 };
  });
  assert.equal(result.multi, 0);
  assert.equal(result.single, true);
  await context.close();
});

test("pages with conditions appear and disappear with entity states", async () => {
  const { page, context } = await openDemo();
  const door = card(page, 18);
  await door.scrollIntoViewIfNeeded();
  const cur = () => door.locator(".face.current");
  assert.equal(await door.locator(".dots button").count(), 0); // two visible pages → no dots
  await door.locator(".stage").click();
  await page.waitForTimeout(800);
  assert.match(await cur().locator(".note-body").innerText(), /Always shown too/);
  await page.evaluate(() => window.__setState("binary_sensor.doorbell", "on"));
  await page.waitForTimeout(100);
  assert.equal(await door.locator(".dots button").count(), 3);
  await door.locator(".stage").focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(800);
  assert.equal(await cur().locator(".title-overlay").innerText(), "Someone rang");
  // The per-page hold action opens the URL instead of the card's default.
  await page.evaluate(() => (window.__events = []));
  const box = await door.locator(".stage").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  const events = await page.evaluate(() => window.__events);
  assert.equal(events[0]?.url, "https://example.com/door");
  await page.evaluate(() => window.__setState("binary_sensor.doorbell", "off"));
  await page.waitForTimeout(100);
  assert.equal(await door.locator(".dots button").count(), 0);
  assert.notEqual(await cur().locator(".title-overlay").innerText(), "Someone rang");
  await context.close();
});

test("unrelated state changes do not re-render the card", async () => {
  const { page, context } = await openDemo();
  await card(page, 1).locator(".stage").click(); // show the note from input_text.fridge_note
  await page.waitForTimeout(800);
  const count = await page.evaluate(async () => {
    const card = document.querySelectorAll("#grid > .cell > pinboard-card")[1];
    let renders = 0;
    const original = card._renderNote.bind(card);
    card._renderNote = (...args) => { renders++; return original(...args); };
    const before = renders;
    for (let i = 0; i < 20; i++) window.__setState("sensor.boiler_temp", String(50 + i));
    const unrelated = renders - before;
    window.__setState("input_text.fridge_note", "Changed " + Date.now());
    return { unrelated, related: renders - before - unrelated };
  });
  assert.equal(count.unrelated, 0);
  assert.equal(count.related, 1);
  await context.close();
});

test("the history panel lists past values with the person who changed them", async () => {
  const { page, context } = await openDemo();
  const fridge = card(page, 1);
  const cur = () => fridge.locator(".face.current");
  await fridge.locator(".stage").click();
  await page.waitForTimeout(800);
  assert.equal(await cur().locator(".history-button").isVisible(), true);
  await cur().locator(".history-button").click();
  await page.waitForFunction(() => document.querySelectorAll("#grid > .cell > pinboard-card")[1].shadowRoot.querySelectorAll(".history-row").length > 0);
  const rows = await cur().locator(".history-row").allInnerTexts();
  assert.equal(rows.length, 2); // the repeated value collapses
  assert.match(rows[0], /Mickey/);
  assert.match(rows[0], /Milk is running low/);
  assert.match(rows[1], /Automation or system/);
  assert.equal(await cur().locator(".note-body").isVisible(), false);
  await cur().locator(".history-button").click();
  assert.equal(await cur().locator(".note-body").isVisible(), true);
  await context.close();
});

test("to-do items show details and can be edited or deleted on the card", async () => {
  const { page, context } = await openDemo();
  const todo = card(page, 12);
  await todo.scrollIntoViewIfNeeded();
  const cur = () => todo.locator(".face.current");
  assert.match(await cur().locator(".todo-desc").first().innerText(), /lactose-free/);
  const item = cur().locator(".todo-item").first(); // Bread
  await item.hover();
  await item.locator(".todo-edit").click();
  await cur().locator(".todo-editor input").fill("Rye bread");
  await cur().locator(".todo-editor textarea").fill("From the bakery, not the supermarket.");
  await cur().locator(".todo-editor .btn.primary").click();
  await page.waitForFunction(() => window.__todoItems.some((i) => i.summary === "Rye bread" && i.description.includes("bakery")));
  await page.waitForTimeout(200);
  assert.match(await cur().locator(".todo-desc").nth(0).innerText(), /bakery/);
  await cur().locator(".todo-item").first().hover();
  await cur().locator(".todo-item").first().locator(".todo-edit").click();
  await cur().locator(".todo-editor .btn").first().click(); // delete
  await page.waitForFunction(() => !window.__todoItems.some((i) => i.summary === "Rye bread"));
  await context.close();
});

test("the editor's note block formats text and keeps a live preview", async () => {
  const { page, context } = await openDemo();
  const editor = page.locator("pinboard-card-editor");
  await page.evaluate(() => {
    const ed = document.querySelector("pinboard-card-editor");
    ed.setConfig({ type: "custom:pinboard-card", image: "./kitchen.jpg", note: "Hello" });
    window.__configs = [];
    ed.addEventListener("config-changed", (ev) => window.__configs.push(ev.detail.config));
  });
  const block = editor.locator(".note-block");
  assert.equal(await block.isVisible(), true);
  const textarea = block.locator(".note-text");
  assert.equal(await textarea.inputValue(), "Hello");
  await textarea.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" world");
  await block.locator(".md-button").nth(0).click(); // bold, no selection → placeholder
  assert.equal(await textarea.inputValue(), "Hello world**text**");
  await textarea.selectText();
  await block.locator(".md-button").nth(4).click(); // checklist prefix
  assert.equal(await textarea.inputValue(), "- [ ] Hello world**text**");
  await page.waitForFunction(() => window.__configs.some((c) => c.note === "- [ ] Hello world**text**"));
  assert.match(await block.locator(".note-preview").innerText(), /Hello world/);
  await context.close();
});

test("small cards enlarge into a popup from the footer button or a long press", async () => {
  const { page, context } = await openDemo();
  const host = page.locator("#sections .host").first(); // 120 px high note card
  const small = host.locator("pinboard-card");
  const cur = () => small.locator(".face.current");
  assert.equal(await cur().locator(".expand-button").isVisible(), true);
  await cur().locator(".expand-button").click();
  const dialog = small.locator("dialog.expand-dialog");
  assert.equal(await dialog.evaluate((el) => el.open), true);
  const inner = dialog.locator("pinboard-card");
  assert.equal(await inner.getAttribute("expanded"), "");
  assert.match(await inner.locator(".face.current .note-body").innerText(), /Herbs: twice a week/);
  assert.equal(await inner.locator(".face.current .expand-button").isVisible(), false);
  const height = await inner.evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(height > 300, `expanded card is ${height}px high`);
  await dialog.locator(".expand-header .icon-button").click();
  assert.equal(await small.locator("dialog").count(), 0);

  // A long press opens it too when no hold action is configured.
  const box = await small.locator(".stage").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  assert.equal(await small.locator("dialog.expand-dialog").evaluate((el) => el.open), true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  assert.equal(await small.locator("dialog").count(), 0);

  // The to-do page opens enlarged on the right page and still ticks items.
  const todo = card(page, 12);
  await todo.scrollIntoViewIfNeeded();
  await todo.evaluate((el) => el.expand());
  const big = todo.locator("dialog pinboard-card");
  assert.match(await big.locator(".face.current .layer-note .note-header .title").innerText(), /Shopping list/);
  await big.locator(".face.current .checklist").first().locator(".check input").nth(0).click();
  await page.waitForFunction(() => window.__todoItems.find((i) => i.summary === "Bread").status === "completed");
  await context.close();
});

test("empty and broken states show placeholders", async () => {
  const { page, context } = await openDemo();
  assert.match(await card(page, 5).locator(".face.current .placeholder").innerText(), /No picture yet/);
  await page.waitForFunction(
    () => document.querySelectorAll("#grid > .cell > pinboard-card")[6].shadowRoot.querySelector(".face.current .placeholder").innerText.includes("could not be loaded"),
  );
  await card(page, 6).locator(".stage").click();
  await page.waitForTimeout(800);
  assert.match(await card(page, 6).locator(".face.current .note-body").innerText(), /input_text\.missing not found/);
  await context.close();
});

test("reduced motion falls back to a crossfade", async () => {
  const { page, context } = await openDemo({ reducedMotion: "reduce" });
  const classes = await card(page, 0).locator(".scene").getAttribute("class");
  assert.match(classes, /\bmode-fade\b/);
  assert.doesNotMatch(classes, /\bmode-flip\b/);
  await context.close();
});

test("language follows hass", async () => {
  const { page, context } = await openDemo();
  await page.click("#lang");
  assert.equal(await card(page, 0).locator(".badge span").innerText(), "Notiz");
  const labels = await page.evaluate(() => {
    const out = {};
    for (const language of ["nl", "fr", "es", "pt"]) {
      const el = document.createElement("pinboard-card");
      el.setConfig({ type: "custom:pinboard-card", image: "./kitchen.jpg", note: "x" });
      el.hass = { states: {}, language, callService: async () => {}, callWS: async () => ({}) };
      document.body.append(el);
      out[language] = el.shadowRoot.querySelector(".badge span").textContent;
      el.remove();
    }
    return out;
  });
  assert.deepEqual(labels, { nl: "Notitie", fr: "Note", es: "Nota", pt: "Note" }); // pt falls back to English
  await context.close();
});

test("the editor emits config-changed", async () => {
  const { page, context } = await openDemo();
  const received = page.evaluate(
    () =>
      new Promise((resolve) => {
        document
          .querySelector("pinboard-card-editor")
          .addEventListener("config-changed", (ev) => resolve(ev.detail.config), { once: true });
      }),
  );
  await page.locator("pinboard-card-editor").locator(".clear").click();
  const config = await received;
  assert.equal(config.image, undefined);
  assert.equal(config.title, "Fridge");
  assert.equal(config.type, "custom:pinboard-card");
  await context.close();
});

test("the public demo separates the showcase from technical fixtures", async () => {
  const { page, context, errors, failedResources } = await openDemo({ technical: false });
  assert.equal(await page.locator("#showcase > .cell > pinboard-card").count(), 6);
  assert.equal(await page.locator("#technical-tests").getAttribute("open"), null);
  assert.equal(await page.locator("#grid").isVisible(), false);
  assert.equal(await page.locator("ha-form pre").count(), 0);
  assert.equal(await page.locator("pinboard-card-editor .page-form input[data-field=image]").count(), 1);
  assert.equal(await page.locator("#grid > .cell").count(), 0);
  assert.deepEqual(failedResources, []);
  await page.locator("#theme").click();
  assert.equal(await page.locator("#theme").getAttribute("aria-pressed"), "true");
  await page.locator("#technical-tests > summary").click();
  await page.locator("#grid > .cell").last().waitFor();
  assert.equal(await page.locator("#grid").isVisible(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test("the demo is responsive without horizontal overflow", async () => {
  for (const width of [375, 768, 1440]) {
    const { page, context } = await openDemo({ technical: false, viewport: { width, height: 1000 } });
    const checkLayout = async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`);
      const boxes = await page.locator("#showcase > .cell").evaluateAll((cells) => cells.map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { width: rect.width, bottom: rect.bottom, cardBottom: cell.querySelector("pinboard-card").getBoundingClientRect().bottom };
      }));
      assert.ok(boxes.every((box) => box.width >= 280), `showcase cards too narrow at ${width}px`);
      assert.ok(boxes.every((box) => box.cardBottom <= box.bottom), `card overflows its showcase tile at ${width}px`);
    };
    await checkLayout();
    await page.locator("#technical-tests").evaluate((element) => { element.open = true; });
    await checkLayout();
    await context.close();
  }
});

test("demo form controls update the card and live preview instead of dumping JSON", async () => {
  const { page, context } = await openDemo({ technical: false });
  const editor = page.locator("pinboard-card-editor");
  const title = editor.locator(".card-form input[data-field=title]");
  await title.fill("My household");
  await title.press("Tab");
  await page.waitForFunction(() => JSON.parse(document.querySelector("#config-output").textContent).title === "My household");
  assert.equal(await page.locator("#playground-preview pinboard-card .face.current .title-overlay").innerText(), "My household");
  assert.equal(await editor.locator(".card-form pre").count(), 0);
  const layout = editor.locator(".card-form select[data-field=layout]");
  await layout.selectOption("grid");
  await page.waitForFunction(() => JSON.parse(document.querySelector("#config-output").textContent).layout === "grid");
  await context.close();
});

test("demo form styling reaches shadow DOM and separates labels, controls and help text", async () => {
  for (const width of [375, 768, 1440]) {
    const { page, context } = await openDemo({ technical: false, viewport: { width, height: 1000 } });
    const editor = page.locator("pinboard-card-editor");
    const input = editor.locator(".page-form input[data-field=image]");
    const layout = await input.evaluate((control) => {
      const field = control.closest("label");
      const label = field.querySelector("span").getBoundingClientRect();
      const helper = field.querySelector("small").getBoundingClientRect();
      const rect = control.getBoundingClientRect();
      const fieldStyle = getComputedStyle(field);
      const controlStyle = getComputedStyle(control);
      return {
        hasOwnShadowRoot: control.getRootNode().host.localName === "ha-form",
        display: fieldStyle.display,
        direction: fieldStyle.flexDirection,
        height: rect.height,
        width: rect.width,
        fieldWidth: field.getBoundingClientRect().width,
        labelGap: rect.top - label.bottom,
        helperGap: helper.top - rect.bottom,
        padding: parseFloat(controlStyle.paddingLeft),
        radius: parseFloat(controlStyle.borderRadius),
        background: controlStyle.backgroundColor,
      };
    });
    assert.equal(layout.hasOwnShadowRoot, true);
    assert.equal(layout.display, "flex");
    assert.equal(layout.direction, "column");
    assert.ok(layout.height >= 42, `input too short at ${width}px`);
    assert.ok(Math.abs(layout.width - layout.fieldWidth) <= 1, `input not full-width at ${width}px`);
    assert.ok(layout.labelGap >= 5, `label overlaps input at ${width}px`);
    assert.ok(layout.helperGap >= 5, `helper overlaps input at ${width}px`);
    assert.ok(layout.padding >= 10);
    assert.ok(layout.radius >= 8);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const gridDisplay = await editor.locator(".card-form .demo-form-grid").first().evaluate((element) => getComputedStyle(element).display);
    assert.equal(gridDisplay, "grid");
    const toggleDisplay = await editor.locator(".card-form .demo-toggle").first().evaluate((element) => getComputedStyle(element).display);
    assert.equal(toggleDisplay, "grid");
    await page.locator("#theme").click();
    assert.notEqual(await input.evaluate((control) => getComputedStyle(control).backgroundColor), layout.background);
    assert.equal(await editor.locator(".page-form").evaluate((form) => getComputedStyle(form).colorScheme), "dark");
    await context.close();
  }
});

test("editor templates select real entities and preserve existing content and settings", async () => {
  const { page, context } = await openDemo();
  const editor = page.locator("pinboard-card-editor");
  await page.evaluate(() => {
    const editor = document.querySelector("pinboard-card-editor");
    editor.setConfig({
      type: "custom:pinboard-card", title: "Existing", image: "./kitchen.jpg", note: "Keep this", transition: "fade",
      tap_action: { action: "flip" },
      hold_action: { action: "more-info", entity: "sensor.boiler_temp" },
      double_tap_action: { action: "url", url_path: "https://example.com" },
    });
    window.__configs = [];
    editor.addEventListener("config-changed", (event) => window.__configs.push(event.detail.config));
  });
  await editor.locator(".templates > summary").click();
  assert.match(await editor.locator(".templates-help").innerText(), /without replacing existing content/);
  assert.match(await editor.locator(".picture-actions .picture-help").innerText(), /Upload a picture/);
  assert.equal(await editor.locator(".apply-template").isDisabled(), true);
  assert.deepEqual(await editor.locator(".template-entity option").evaluateAll((options) => options.map((option) => option.value)), ["", "todo.shopping"]);
  await editor.locator(".template-entity").selectOption("todo.shopping");
  await editor.locator(".apply-template").click();
  let config = await page.evaluate(() => window.__configs.at(-1));
  assert.equal(config.transition, "fade");
  assert.equal(config.title, "Existing");
  assert.deepEqual(config.tap_action, { action: "flip" });
  assert.deepEqual(config.hold_action, { action: "more-info", entity: "sensor.boiler_temp" });
  assert.deepEqual(config.double_tap_action, { action: "url", url_path: "https://example.com" });
  assert.deepEqual(config.slides[0], { image: "./kitchen.jpg", note: "Keep this" });
  assert.deepEqual(config.slides[1], { title: "Shopping list", todo_entity: "todo.shopping", color: "yellow" });
  await editor.locator(".template-type").selectOption("family");
  assert.equal(await editor.locator(".template-entity option[value='todo.shopping']").count(), 0);
  await editor.locator(".template-entity").selectOption("input_text.fridge_note");
  await editor.locator(".apply-template").click();
  config = await page.evaluate(() => window.__configs.at(-1));
  assert.equal(config.slides[2].note_entity, "input_text.fridge_note");
  assert.match(await editor.locator(".setup-guidance").innerText(), /255 characters/);
  await editor.locator(".template-type").selectOption("maintenance");
  assert.equal(await editor.locator(".template-entity-field").isVisible(), false);
  await editor.locator(".apply-template").click();
  config = await page.evaluate(() => window.__configs.at(-1));
  assert.equal(config.slides.length, 4);
  assert.match(config.slides[3].note, /Last service/);
  assert.equal(config.slides[3].color, "green");
  assert.equal(await editor.locator(".note-preview h2").innerText(), "Maintenance");
  await context.close();
});

test("templates handle empty cards, missing entities and the expanded page limit", async () => {
  const { page, context } = await openDemo();
  const editor = page.locator("pinboard-card-editor");
  await page.evaluate(() => {
    const editor = document.querySelector("pinboard-card-editor");
    editor.setConfig({ type: "custom:pinboard-card" });
    window.__configs = [];
    editor.addEventListener("config-changed", (event) => window.__configs.push(event.detail.config));
    editor.hass = { ...editor.hass, states: {} };
  });
  await editor.locator(".templates > summary").click();
  assert.match(await editor.locator(".template-status").innerText(), /No to-do list found/);
  assert.equal(await editor.locator(".apply-template").isDisabled(), true);
  await editor.locator(".template-type").selectOption("family");
  assert.match(await editor.locator(".template-status").innerText(), /Create a Text helper/);
  await editor.locator(".template-type").selectOption("maintenance");
  await editor.locator(".apply-template").click();
  let config = await page.evaluate(() => window.__configs.at(-1));
  assert.equal(config.slides, undefined);
  assert.match(config.note, /Last service/);
  await page.evaluate(() => {
    document.querySelector("pinboard-card-editor").setConfig({
      type: "custom:pinboard-card",
      slides: Array.from({ length: 5 }, () => ({ image: "./kitchen.jpg", note: "Two pages" })),
    });
  });
  assert.equal(await editor.locator(".apply-template").isDisabled(), true);
  assert.match(await editor.locator(".template-status").innerText(), /10/);
  assert.equal(await page.evaluate(() => window.__configs.length), 1);
  await context.close();
});

test("setup guidance explains missing entities, attributes and read-only notes and updates with hass", async () => {
  const { page, context } = await openDemo();
  const editor = page.locator("pinboard-card-editor");
  await page.evaluate(() => document.querySelector("pinboard-card-editor").setConfig({ type: "custom:pinboard-card", note_entity: "input_text.new_note" }));
  assert.match(await editor.locator(".setup-guidance").innerText(), /input_text.new_note was not found/);
  await page.evaluate(() => {
    const editor = document.querySelector("pinboard-card-editor");
    editor.hass = { ...editor.hass, states: { ...editor.hass.states, "input_text.new_note": { state: "Hello", attributes: {} } } };
  });
  assert.equal(await editor.locator(".setup-guidance").isVisible(), false);
  await page.evaluate(() => document.querySelector("pinboard-card-editor").setConfig({ type: "custom:pinboard-card", note_entity: "sensor.boiler_temp", note_attribute: "missing" }));
  assert.match(await editor.locator(".setup-guidance").innerText(), /read-only/);
  assert.match(await editor.locator(".setup-guidance").innerText(), /Attribute missing was not found/);
  await page.evaluate(() => document.querySelector("pinboard-card-editor").setConfig({ type: "custom:pinboard-card", note: "- [ ] Unsaved checkbox" }));
  assert.match(await editor.locator(".setup-guidance").innerText(), /Checkboxes in YAML notes are read-only/);
  await page.evaluate(() => document.querySelector("pinboard-card-editor").setConfig({ type: "custom:pinboard-card", note: "- [ ] Unsaved checkbox", checklist: false }));
  assert.equal(await editor.locator(".setup-guidance").isVisible(), false);
  await context.close();
});

test("templates and setup guidance are localized in every supported language", async () => {
  const { page, context } = await openDemo();
  const labels = await page.evaluate(() => {
    const editor = document.querySelector("pinboard-card-editor");
    const result = {};
    editor.setConfig({ type: "custom:pinboard-card", note_entity: "input_text.missing" });
    for (const language of ["en", "de", "nl", "fr", "es"]) {
      editor.hass = { ...editor.hass, language, locale: { language } };
      result[language] = {
        label: editor.shadowRoot.querySelector(".templates-label").textContent,
        guidance: editor.shadowRoot.querySelector(".setup-messages").textContent,
      };
    }
    return result;
  });
  assert.equal(labels.en.label, "Start with a template");
  assert.equal(labels.de.label, "Mit einer Vorlage starten");
  assert.equal(labels.nl.label, "Begin met een sjabloon");
  assert.equal(labels.fr.label, "Commencer avec un modèle");
  assert.equal(labels.es.label, "Empezar con una plantilla");
  for (const value of Object.values(labels)) {
    assert.match(value.guidance, /input_text\.missing/);
    assert.doesNotMatch(value.guidance, /editor_setup_/);
  }
  await context.close();
});
