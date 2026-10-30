// Every language must carry the same keys as English, otherwise the card
// silently falls back to English strings for that language.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8");
const tables = {};
for (const match of source.matchAll(/^const (\w+): Strings = \{\n([\s\S]*?)^\};/gm)) {
  tables[match[1]] = new Set([...match[2].matchAll(/^  (\w+):/gm)].map((m) => m[1]));
}

test("every language defines the same strings as English", () => {
  assert.ok(tables.en?.size > 100, "English table found");
  for (const lang of ["de", "nl", "fr", "es"]) {
    const missing = [...tables.en].filter((key) => !tables[lang].has(key));
    const extra = [...tables[lang]].filter((key) => !tables.en.has(key));
    assert.deepEqual(missing, [], `${lang} is missing strings`);
    assert.deepEqual(extra, [], `${lang} has strings English does not`);
  }
});
