import assert from "node:assert/strict";
import test from "node:test";

test("strict CSP blocks nonce-less registration, then accepts an explicit nonce without caching the failure", async t => {
  const previous = Object.fromEntries(["window", "document", "HTMLElement", "ResizeObserver", "MutationObserver", "IntersectionObserver", "matchMedia", "customElements"]
    .map(name => [name, globalThis[name]]));
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  const styles = new Map();
  const defined = new Map();
  globalThis.window = {};
  globalThis.HTMLElement = class {};
  globalThis.ResizeObserver = class {};
  globalThis.MutationObserver = class {};
  globalThis.IntersectionObserver = class {};
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.customElements = {
    get: name => defined.get(name),
    define: (name, constructor) => defined.set(name, constructor)
  };
  globalThis.document = {
    getElementById: id => styles.get(id) ?? null,
    createElement(name) {
      assert.equal(name, "style");
      return { tagName: "STYLE", sheet: null, nonce: "", textContent: "", remove() { styles.delete(this.id); } };
    },
    head: { append(style) {
      style.sheet = style.nonce === "trustedNonce" ? {} : null;
      styles.set(style.id, style);
    } }
  };

  const { registerShaderFont } = await import("../src/index.js");
  assert.equal((await registerShaderFont()).error, "STYLES_BLOCKED");
  assert.equal(styles.size, 0);
  assert.equal(defined.size, 0, "a blocked stylesheet must not report a registered component");
  assert.equal((await registerShaderFont({ styleNonce: "bad nonce" })).error, "INVALID_STYLE_NONCE");
  assert.equal((await registerShaderFont({ styleNonce: "trustedNonce" })).ok, true);
  const installed = styles.get("shader-font-component-styles");
  assert.equal(installed.nonce, "trustedNonce");
  assert.ok(installed.sheet);
  assert.equal(defined.has("shader-font"), true);
  assert.equal((await registerShaderFont()).ok, true);
  assert.equal(styles.get(installed.id), installed, "repeat registration must reuse an active stylesheet");
  assert.equal((await registerShaderFont({ styleNonce: "wrongNonce" })).ok, true);
  styles.delete(installed.id);
  assert.equal((await registerShaderFont()).ok, true, "an unrelated nonce must not poison the remembered trusted nonce");

  const active = styles.get(installed.id);
  active.sheet = null;
  assert.equal((await registerShaderFont({ styleNonce: "trustedNonce" })).ok, true);
  assert.notEqual(styles.get(installed.id), active, "replace a stale blocked stylesheet");
  styles.get(installed.id).sheet.disabled = true;
  assert.equal((await registerShaderFont({ styleNonce: "trustedNonce" })).ok, true);
  assert.equal(styles.get(installed.id).sheet.disabled, undefined, "replace a disabled stylesheet");
  styles.set(installed.id, { tagName: "DIV", textContent: "not this package", sheet: {} });
  assert.equal((await registerShaderFont({ styleNonce: "trustedNonce" })).error, "STYLES_CONFLICT");
});
