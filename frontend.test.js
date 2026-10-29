import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");

test("frontend includes all expected panels and settings controls", () => {
  for (const id of ["view-dashboard", "view-chat", "view-voice", "view-agent", "view-kalliope", "view-docs", "view-security", "api-key", "base-url", "model-name", "save-settings"]) {
    assert.match(html, new RegExp(`id=[\"']${id}[\"']`), `missing ${id}`);
  }
  const classLists = [...html.matchAll(/class=["']([^"']+)["']/g)].map((m) => m[1].split(/\s+/));
  assert.equal(classLists.filter((classes) => classes.includes("view")).length, 7);
  assert.equal(classLists.filter((classes) => classes.includes("card")).length, 6);
});

test("frontend explains Worker configuration and browser token risk", () => {
  assert.match(html, /JalalAI Worker Access Token/);
  assert.match(html, /local storage/i);
  assert.match(html, /workers\.dev\/v1/);
});

test("Worker does not use wildcard CORS and keeps provider key server-side", () => {
  assert.doesNotMatch(worker, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);
  assert.match(worker, /env\.GEMINI_API_KEY/);
  assert.match(worker, /env\.JALALAI_ACCESS_TOKEN/);
  assert.match(worker, /env\.RATE_LIMITER/);
});
