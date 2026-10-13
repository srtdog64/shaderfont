import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { demoCopy } from "../demo/copy.js";
import { DragEffect, GestureTag } from "../src/core.js";
import { SHADER_FONT_DEFAULTS, SHADER_PRESETS, shaderFontAttributes } from "../src/options.js";

const demoPages = ["index.html", "index.ko.html"];
const readDemo = name => readFile(new URL(`../demo/${name}`, import.meta.url), "utf8");

test("English and Korean demos share controls and behavior, with reciprocal language links", async () => {
  const [english, korean] = await Promise.all(demoPages.map(readDemo));
  assert.match(english, /<html lang="en">/);
  assert.match(korean, /<html lang="ko">/);
  assert.doesNotMatch(english, /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/);
  const ids = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(ids(english), ids(korean));
  for (const html of [english, korean]) {
    assert.match(html, /src="\.\/demo\.js"/);
    assert.match(html, /href="\.\/demo\.css"/);
    for (const page of demoPages) assert.ok(html.includes(`href="./${page}"`));
    assert.match(html, /contenteditable="true"/);
    assert.match(html, /id="renderer-error" role="alert" hidden/);
  }
});

test("both demo translations cover every material, drag effect and gesture state", () => {
  for (const language of ["en", "ko"]) {
    const copy = demoCopy(language);
    assert.deepEqual(Object.keys(copy.materials).sort(), SHADER_PRESETS.map(preset => preset.name).sort());
    assert.deepEqual(Object.keys(copy.effects).sort(), Object.values(DragEffect).sort());
    assert.deepEqual(Object.keys(copy.hints).sort(), Object.values(DragEffect).sort());
    assert.deepEqual(Object.keys(copy.states).sort(), Object.values(GestureTag).sort());
    for (const dictionary of [copy.materials, copy.effects, copy.hints, copy.states]) {
      for (const text of Object.values(dictionary)) assert.ok(text.trim());
    }
    assert.ok(copy.rendererError("TEST_ERROR").includes("TEST_ERROR"));
    assert.ok(copy.applySample(copy.materials.flame).includes(copy.materials.flame));
  }
  assert.throws(() => demoCopy("fr"), /Unsupported demo language/);
  assert.throws(() => demoCopy("toString"), /Unsupported demo language/);
});

test("renderer and reset attempts keep new synchronous failures visible, but clear stale errors", async t => {
  class DemoElement extends EventTarget {
    constructor() {
      super();
      this.attributes = new Map();
      this.value = "";
      this.textContent = "";
      this.hidden = true;
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    append() {}
  }
  const defaults = shaderFontAttributes(SHADER_FONT_DEFAULTS);
  const ids = ["sentence", "status", "gesture-hint", "example", "reveal-settings", "replay-reveal", "reset", "renderer-error", "presets", ...Object.keys(defaults)];
  const elements = new Map(ids.map(id => [id, new DemoElement()]));
  for (const [id, value] of Object.entries(defaults)) elements.get(id).value = value;
  const previousDocument = globalThis.document;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  globalThis.document = {
    documentElement: { lang: "en" },
    querySelector: selector => {
      assert.ok(elements.has(selector.slice(1)), `Unexpected demo selector: ${selector}`);
      return elements.get(selector.slice(1));
    },
    querySelectorAll: () => [],
    createElement: () => new DemoElement()
  };
  const sentence = elements.get("sentence");
  sentence.textContent = "Demo text";
  let fail = true;
  const reportFailure = () => {
    if (fail) sentence.dispatchEvent(new CustomEvent("shaderfont-error", { detail: { code: "WEBGL_UNAVAILABLE" } }));
  };
  sentence.setAttribute = (name, value) => {
    sentence.attributes.set(name, value);
    if (name === "renderer") reportFailure();
  };
  sentence.resetPosition = reportFailure;
  await import("../demo/demo.js?error-regression");
  const error = elements.get("renderer-error");
  elements.get("renderer").value = "webgl";
  elements.get("renderer").dispatchEvent(new Event("input"));
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /WEBGL_UNAVAILABLE/);
  elements.get("reset").dispatchEvent(new Event("click"));
  assert.equal(error.hidden, false);
  fail = false;
  elements.get("reset").dispatchEvent(new Event("click"));
  assert.equal(error.hidden, true);
  error.hidden = false;
  elements.get("renderer").dispatchEvent(new Event("input"));
  assert.equal(error.hidden, true);
});

test("the demo server redirects the root and serves both pages and shared assets", { timeout: 10000 }, async t => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../tools/serve.mjs", import.meta.url))], {
    env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(() => child.kill());
  const base = await new Promise((resolve, reject) => {
    let output = "";
    child.once("error", reject);
    child.once("exit", code => reject(new Error(`Demo server exited before listening: ${code}`)));
    child.stdout.on("data", chunk => {
      output += chunk;
      const match = output.match(/Shaderfont demo: (http:\/\/127\.0\.0\.1:\d+\/)/);
      if (match) resolve(match[1]);
    });
    child.stderr.on("data", chunk => reject(new Error(String(chunk))));
  });
  const root = await fetch(base, { redirect: "manual" });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get("location"), "/demo/index.html");
  for (const page of demoPages) {
    const url = new URL(`demo/${page}`, base);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    for (const match of html.matchAll(/(?:src|href)="(\.[^"]+)"/g)) {
      assert.equal((await fetch(new URL(match[1], url))).status, 200, match[1]);
    }
  }
  assert.equal((await fetch(new URL("does-not-exist", base))).status, 404);
});
