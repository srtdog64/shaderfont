import assert from "node:assert/strict";
import { createReadStream, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const nonce = "dGVzdE5vbmNl";
const policy = `default-src 'self'; script-src 'self'; style-src-elem 'self' 'nonce-${nonce}'; style-src-attr 'none'; img-src 'self' data:; connect-src 'self'; object-src 'none'`;
const css = "body{margin:24px;background:#fff;color:#111827;font:700 36px/1.5 sans-serif;--sf-primary:#fff;--sf-secondary:#fff;--sf-accent:#fff}body.dark{background:#020617;color:#fff}shader-font{font:inherit}#css-vars{--sf-primary:#ff0000}";
const server = createServer((request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    const headers = { "content-security-policy": policy, "x-content-type-options": "nosniff" };
    if (path === "/") {
      response.writeHead(200, { ...headers, "content-type": "text/html; charset=utf-8" })
        .end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><main id="mount"></main>');
      return;
    }
    if (path === "/fixture.css") {
      response.writeHead(200, { ...headers, "content-type": "text/css; charset=utf-8" }).end(css);
      return;
    }
    const target = resolve(root, path.replace(/^\/+/, ""));
    if (!target.startsWith(`${root}${sep}`) || !target.endsWith(".js") || !statSync(target).isFile()) {
      response.writeHead(404, headers).end();
      return;
    }
    response.writeHead(200, { ...headers, "content-type": "text/javascript; charset=utf-8" });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage();
  await page.goto(base);
  await page.evaluate(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", event => {
      window.__cspViolations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    });
  });
  const blocked = await page.evaluate(async () => (await import("/src/index.js")).registerShaderFont());
  assert.equal(blocked.error, "STYLES_BLOCKED", "CSP must not turn a blocked stylesheet into registration success");
  assert.equal(await page.evaluate(() => !!customElements.get("shader-font")), false);

  const registered = await page.evaluate(async nonce => (await import("/src/index.js")).registerShaderFont({ styleNonce: nonce }), nonce);
  assert.equal(registered.ok, true, JSON.stringify(registered));
  const initial = await page.evaluate(() => {
    const host = document.createElement("shader-font");
    host.id = "hologram";
    host.textContent = "Hologram sample text";
    host.setAttribute("shader", "hologram");
    for (const [key, value] of Object.entries({ primary: "#075985", secondary: "#9f1239", accent: "#5b21b6" })) host.setAttribute(key, value);
    document.querySelector("#mount").append(host, document.createElement("br"));
    const style = getComputedStyle(host);
    const stylesheet = document.getElementById("shader-font-component-styles");
    return {
      styleNonce: stylesheet.nonce, sheet: !!stylesheet.sheet,
      status: host.dataset.styleStatus, text: host.textContent,
      background: style.backgroundImage, fill: style.webkitTextFillColor,
      animation: style.animationName, clip: style.backgroundClip,
      primary: style.getPropertyValue("--_sf-author-primary").trim()
    };
  });
  assert.deepEqual([initial.styleNonce, initial.sheet, initial.status], [nonce, true, "ready"]);
  assert.match(initial.background, /gradient/);
  assert.match(initial.clip, /text/);
  assert.equal(initial.fill, "rgba(0, 0, 0, 0)");
  assert.match(initial.animation, /shader-font-scan/);
  assert.equal(initial.primary, "#075985");
  assert.match(initial.background, /rgb\(7, 89, 133\)/, "an inherited white CSS variable must not replace an authored color");

  const dark = await page.evaluate(() => {
    document.body.classList.add("dark");
    const host = document.getElementById("hologram");
    const before = { background: getComputedStyle(host).backgroundImage, primary: getComputedStyle(host).getPropertyValue("--_sf-author-primary").trim() };
    return import("/src/index.js").then(({ SHADER_FONT_PALETTES }) => {
      const palette = SHADER_FONT_PALETTES.find(item => item.name === "dark");
      for (const name of ["primary", "secondary", "accent"]) host.setAttribute(name, palette[name]);
      const style = getComputedStyle(host);
      return { before, background: style.backgroundImage, animation: style.animationName,
        primary: style.getPropertyValue("--_sf-author-primary").trim(), fill: style.webkitTextFillColor };
    });
  });
  assert.equal(dark.before.primary, "#075985", "theme change must not overwrite authored colors");
  assert.match(dark.before.background, /gradient/);
  assert.equal(dark.primary, "#69efff");
  assert.match(dark.background, /gradient/);
  assert.match(dark.animation, /shader-font-scan/);
  assert.equal(dark.fill, "rgba(0, 0, 0, 0)");
  assert.match(dark.background, /rgb\(105, 239, 255\)/);

  const themeRoundTrip = await page.evaluate(async () => {
    const host = document.getElementById("hologram");
    const { SHADER_FONT_PALETTES } = await import("/src/index.js");
    const paint = name => {
      const palette = SHADER_FONT_PALETTES.find(item => item.name === name);
      for (const color of ["primary", "secondary", "accent"]) host.setAttribute(color, palette[color]);
      return getComputedStyle(host).backgroundImage;
    };
    document.body.classList.remove("dark");
    const light = paint("light");
    document.body.classList.add("dark");
    const darkAgain = paint("dark");
    return { light, darkAgain };
  });
  assert.match(themeRoundTrip.light, /rgb\(7, 89, 133\)/);
  assert.match(themeRoundTrip.darkAgain, /rgb\(105, 239, 255\)/);

  const cssVariable = await page.evaluate(() => {
    const host = document.createElement("shader-font");
    host.id = "css-vars";
    host.textContent = "Variable fallback";
    document.querySelector("#mount").append(host, document.createElement("br"));
    const variableBackground = getComputedStyle(host).backgroundImage;
    host.setAttribute("primary", "#123456");
    return { variableBackground, authoredBackground: getComputedStyle(host).backgroundImage };
  });
  assert.match(cssVariable.variableBackground, /rgb\(255, 0, 0\)/);
  assert.match(cssVariable.authoredBackground, /rgb\(18, 52, 86\)/);

  const procedural = await page.evaluate(async () => {
    const host = document.createElement("shader-font");
    host.id = "procedural";
    host.textContent = "Procedural sample text";
    host.setAttribute("shader", "noise");
    host.setAttribute("speed", "1");
    const { SHADER_FONT_PALETTES } = await import("/src/index.js");
    const palette = SHADER_FONT_PALETTES.find(item => item.name === "dark");
    for (const name of ["primary", "secondary", "accent"]) host.setAttribute(name, palette[name]);
    document.querySelector("#mount").append(host, document.createElement("br"));
    return host.textContent;
  });
  assert.equal(procedural, "Procedural sample text");
  await page.waitForFunction(() => document.querySelector("#procedural")?.dataset.materialStatus === "ready", null, { timeout: 5000 });
  const material = await page.evaluate(() => {
    const host = document.getElementById("procedural");
    return { image: getComputedStyle(host).backgroundImage, fill: getComputedStyle(host).webkitTextFillColor,
      status: host.dataset.styleStatus, text: host.textContent };
  });
  assert.match(material.image, /data:image\/png/);
  assert.equal(material.fill, "rgba(0, 0, 0, 0)");
  assert.equal(material.status, "ready");

  const screenshotDir = await mkdtemp(join(tmpdir(), "shaderfont-csp-"));
  await page.screenshot({ path: join(screenshotDir, "dark.png") });

  const selectedText = await page.evaluate(() => {
    const host = document.getElementById("hologram");
    host.setAttribute("dissolve-ms", "200");
    host.setAttribute("restore-ms", "100");
    const start = host.textContent.indexOf("sample");
    const range = document.createRange();
    range.setStart(host.firstChild, start);
    range.setEnd(host.firstChild, start + 6);
    const rect = range.getBoundingClientRect();
    const pointer = { pointerId: 1, pointerType: "mouse", button: 0, clientX: rect.left, clientY: rect.top, preventDefault() {} };
    host.onPointerDown(pointer);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    host.onPointerMove({ ...pointer, clientX: rect.left + 60 });
    host.onPointerEnd({ ...pointer, type: "pointerup" });
    return getSelection().toString();
  });
  assert.equal(selectedText, "sample");
  await page.waitForFunction(() => document.getElementById("hologram").dissolve > 0, null, { timeout: 5000 });
  const selected = await page.evaluate(() => {
    const host = document.getElementById("hologram");
    return { text: host.textContent, selection: getSelection().toString(), mask: host.style.maskImage, status: host.dataset.styleStatus };
  });
  assert.equal(selected.text, initial.text);
  assert.equal(selected.selection, "sample");
  assert.match(selected.mask, /data:image\/png/);
  assert.equal(selected.status, "ready");
  await page.evaluate(() => getSelection().removeAllRanges());
  await page.waitForFunction(() => document.getElementById("hologram").style.maskImage === "none", null, { timeout: 5000 });

  await page.evaluate(() => {
    const host = document.getElementById("hologram");
    host.setAttribute("reveal-ms", "1200");
    host.setAttribute("reveal-interval-ms", "0");
    host.setAttribute("reveal-effect", "burn");
  });
  await page.waitForFunction(() => document.getElementById("hologram").dataset.revealStatus === "ready", null, { timeout: 5000 });
  const reveal = await page.evaluate(() => {
    const host = document.getElementById("hologram");
    return { mask: host.style.maskImage, edge: host.style.getPropertyValue("--sf-burn-edge-image"), text: host.textContent };
  });
  assert.match(reveal.mask, /data:image\/png/);
  assert.match(reveal.edge, /data:image\/png/);
  assert.equal(reveal.text, initial.text);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => document.getElementById("hologram").dataset.revealState === "reduced-motion", null, { timeout: 5000 });
  await page.waitForFunction(() => {
    const host = document.getElementById("procedural");
    return host.dataset.shaderPaused === "true" && host.materialFrame === 0;
  }, null, { timeout: 5000 });
  const reduced = await page.evaluate(() => {
    const host = document.getElementById("hologram");
    const style = getComputedStyle(host);
    return { animation: style.animationName, background: style.backgroundImage,
      reveal: host.dataset.revealState, text: host.textContent };
  });
  assert.equal(reduced.animation, "none");
  assert.match(reduced.background, /gradient/);
  assert.equal(reduced.reveal, "reduced-motion");
  assert.equal(reduced.text, initial.text);
  assert.match(await page.evaluate(() => getComputedStyle(document.getElementById("procedural")).backgroundImage), /data:image\/png/,
    "reduced motion must retain a static procedural fill");
  const violations = await page.evaluate(() => window.__cspViolations);
  assert.deepEqual(violations.map(item => item.directive), ["style-src-elem"],
    "only the deliberate nonce-less registration should violate CSP");
  console.log(JSON.stringify({ blocked: blocked.error, nonceApplied: initial.sheet,
    hologram: initial.animation, lightDarkRoundTrip: true, darkPalette: dark.primary, materialReady: material.status,
    selectionPreserved: selected.selection, dissolveMask: selected.mask.includes("data:image/png"),
    revealEdge: reveal.edge.includes("data:image/png"), reducedMotion: reduced.reveal,
    cspViolations: violations, screenshotDir }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
