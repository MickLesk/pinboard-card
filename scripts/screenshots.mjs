// Regenerates the README screenshots in docs/images/.
//
//   npm run screenshots
//
// The demo page already carries the Home Assistant stubs and the fake states,
// so this script only borrows its `hass`, drops a few cards on a clean canvas
// and photographs them. Keep it in sync with the README whenever the pictures
// there are meant to show something else.
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startServer } from "./serve_demo.mjs";

const out = (name) => fileURLToPath(new URL(`../docs/images/${name}`, import.meta.url));
const SCALE = 2; // retina, so the pictures stay sharp on GitHub
const SETTLE = 1200; // long enough for a flip, the dots and the lazy pictures
const FLIP_AT = 1750; // ms into a 4 s flip, see flipShot()

const ROW = [
  {
    type: "custom:pinboard-card",
    title: "Kitchen",
    image: "./kitchen.jpg",
    note: "**Filter replaced** on 12 Oct.\n\nNext change due in 6 months.\n\n- Model: XY-200",
  },
  {
    type: "custom:pinboard-card",
    title: "Fridge",
    image: "./garden.jpg",
    note_entity: "input_text.fridge_note",
  },
  {
    type: "custom:pinboard-card",
    title: "Garage",
    images: [
      { image: "./workshop.jpg", title: "Tools" },
      { image: "./kitchen.jpg", title: "Kitchen" },
      { image: "./garden.jpg", title: "Garden" },
      { image: "./workshop.jpg", title: "Bench" },
      { image: "./kitchen.jpg", title: "Stove" },
      { image: "./garden.jpg", title: "Beds" },
    ],
  },
];

const FLIP = {
  type: "custom:pinboard-card",
  title: "Kitchen",
  image: "./kitchen.jpg",
  note: "**Filter replaced** on 12 Oct.\n\nNext change due in 6 months.\n\n- Model: XY-200",
};

// Lays out `configs` side by side on an otherwise empty page and returns the
// strip locator. Everything the demo page itself rendered is hidden first.
async function stage(page, configs, { cardWidth, gap = 24 }) {
  await page.evaluate(
    ({ configs, cardWidth, gap }) => {
      const hass = window.__cards[0].hass;
      for (const child of [...document.body.children]) child.style.display = "none";
      const strip = document.createElement("div");
      strip.id = "shot";
      strip.style.cssText = `display:flex;gap:${gap}px;padding:${gap}px;width:max-content;background:#fafafa`;
      document.body.append(strip);
      window.__shot = configs.map((config) => {
        const holder = document.createElement("div");
        holder.style.width = `${cardWidth}px`;
        const card = document.createElement("pinboard-card");
        card.setConfig(config);
        card.hass = hass;
        holder.append(card);
        strip.append(holder);
        return card;
      });
    },
    { configs, cardWidth, gap },
  );
  return page.locator("#shot");
}

async function cardsShot(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 600 }, deviceScaleFactor: SCALE });
  const page = await context.newPage();
  await page.goto(`${baseUrl}demo/`, { waitUntil: "networkidle" });

  const strip = await stage(page, ROW, { cardWidth: 340 });
  const cards = strip.locator("pinboard-card");

  // Second card rests on its note, so the picture and the note side are both
  // visible in one picture.
  await cards.nth(1).evaluate((card) => card.flip());

  // Third card shows the gallery controls: hover brings the arrows in, and two
  // clicks move it off the first page so the dots have something to say.
  const gallery = cards.nth(2).locator(".stage");
  await gallery.hover();
  await cards.nth(2).locator(".nav.next").click({ force: true });
  await page.waitForTimeout(SETTLE);
  await cards.nth(2).locator(".nav.next").click({ force: true });
  await gallery.hover();
  await page.waitForTimeout(SETTLE);

  // JPEG: this one is mostly photograph, and a PNG of it is ten times the size.
  await strip.screenshot({ path: out("cards.jpg"), type: "jpeg", quality: 88 });
  await context.close();
}

async function flipShot(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: SCALE });
  const page = await context.newPage();
  await page.goto(`${baseUrl}demo/`, { waitUntil: "networkidle" });

  const strip = await stage(page, [FLIP], { cardWidth: 340 });
  const card = strip.locator("pinboard-card").first();

  // Slow the flip right down so the frame we catch does not depend on how busy
  // the machine is. The note side turns towards the camera past the halfway
  // point; FLIP_AT picks a moment where it reads but the turn still shows.
  await card.evaluate((el) => el.style.setProperty("--pinboard-duration", "4000ms"));
  await page.waitForTimeout(200);
  await card.evaluate((el) => el.flip());
  await page.waitForTimeout(FLIP_AT);

  await strip.screenshot({ path: out("flip.png") });
  await context.close();
}

const { server, url } = await startServer(0);
const browser = await chromium.launch();
try {
  await cardsShot(browser, url);
  await flipShot(browser, url);
  console.log("wrote docs/images/cards.jpg and docs/images/flip.png");
} finally {
  await browser.close();
  server.close();
}
