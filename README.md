# Shaderfont

[한국어](./README.ko.md)

A Web Component that adds animated materials and drag effects to ordinary DOM text. It uses your existing font and keeps text selectable and copyable. Add `contenteditable="true"` to edit it in place.

## Use it

```sh
npm install shaderfont
```

Register it in the browser, then use the element in your HTML:

```js
import { registerShaderFont } from "shaderfont";

const result = await registerShaderFont();
if (!result.ok) throw new Error(result.error);
```

```html
<shader-font shader="hologram" drag-effect="dissolve">
  Hello
</shader-font>
```

Choose a `shader` such as `noise`, `plasma`, `aurora`, `cyber`, `flame` or `waves`. Dissolve fades only the selected letters and restores them when you clear the selection. The other drag effects (`move`, `shake`, `elastic`) move the whole element. Set `reveal-effect="burn"` for a timed reveal. Each effect can be turned off with `none`; colors and timing are separate options.

## How it works

The browser lays out the text. CSS `background-clip: text` clips animated patterns to the letters, while dissolve reads the native `Selection/Range` and masks the selected part with noise. Canvas 2D is the default renderer; `renderer="webgl"` uses WebGL 2 for procedural materials and masks. Hologram and movement effects use CSS. The component does not generate font files or run METAFONT.

The root import is safe for SSR. Call `registerShaderFont()` only in the browser; `shaderfont/browser` registers immediately and is browser-only.

### CSP and colors

On a site that disallows inline styles, pass the nonce supplied by your server **when registering** `<shader-font>`:

```js
const result = await registerShaderFont({ styleNonce: trustedNonce });
if (!result.ok) throw new Error(result.error);
```

The package checks that its stylesheet actually loaded. A blocked style returns `STYLES_BLOCKED`; a later call with the right nonce can retry. Do not read an arbitrary nonce from the DOM or relax CSP with `unsafe-inline`. The immediate `shaderfont/browser` entry has no nonce parameter, so use the root registration API on strict-CSP pages. If your policy also restricts images, allow `data:` in `img-src` for procedural materials and dissolve/reveal masks.

Colors follow this order: `primary`/`secondary`/`accent` attributes, then element or inherited `--sf-primary`/`--sf-secondary`/`--sf-accent` CSS variables, then the light palette. The package does not silently replace stored colors when the page changes theme. For a dark background, opt into `SHADER_FONT_PALETTES.find(p => p.name === "dark")` and set its three colors on the element; switch back to the light palette when needed. This also keeps an unrelated global white CSS variable from covering authored colors.

## Try the demo

Clone this repository and run:

```sh
npm run demo
npm run check
npm run check:browser
```

The browser check uses local Chrome and sends a strict CSP header. It covers nonce rejection/retry, light and dark colors, hologram animation, procedural material, selection dissolve, burn reveal and reduced motion.

Open the [English demo](http://127.0.0.1:8766/demo/index.html) or [Korean demo](http://127.0.0.1:8766/demo/index.ko.html). Both have the same controls and editable text.

[MIT license](./LICENSE).
