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

## Try the demo

Clone this repository and run:

```sh
npm run demo
npm run check
```

Open the [English demo](http://127.0.0.1:8766/demo/index.html) or [Korean demo](http://127.0.0.1:8766/demo/index.ko.html). Both have the same controls and editable text.

[MIT license](./LICENSE).
