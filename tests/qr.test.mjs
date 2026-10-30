// The QR module is bundled on the fly and its output decoded with an independent reader.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import jsQR from "jsqr";

const bundled = await build({
  entryPoints: [new URL("../src/qr.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const { qrModules, QR_MAX_BYTES } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);

function rasterize(modules, scale = 4, quiet = 4) {
  const size = (modules.length + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  modules.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const px = ((r + quiet) * scale + y) * size + (c + quiet) * scale + x;
          data[px * 4] = data[px * 4 + 1] = data[px * 4 + 2] = 0;
        }
      }
    }),
  );
  return { data, width: size, height: size };
}

test("QR codes decode to their content", () => {
  for (const text of ["https://example.com/pinboard", "WIFI:T:WPA;S:Pinboard Guest;P:correct-horse-battery;;", "Grüße aus Köln ☕"]) {
    const modules = qrModules(text);
    assert.ok(modules, `modules for ${text}`);
    assert.equal(modules.length, modules[0].length);
    const { data, width, height } = rasterize(modules);
    const decoded = jsQR(data, width, height);
    assert.equal(decoded?.data, text);
  }
});

test("empty and oversized content yields no code", () => {
  assert.equal(qrModules("   "), null);
  assert.equal(qrModules("x".repeat(QR_MAX_BYTES + 1)), null);
  assert.ok(qrModules("x".repeat(QR_MAX_BYTES)));
});
