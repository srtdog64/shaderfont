# Shaderfont

[English](./README.md)

일반 웹 텍스트에 움직이는 재질과 드래그 효과를 붙이는 Web Component입니다. 기존 폰트를 그대로 쓰며, 텍스트를 선택·복사할 수 있습니다. 직접 편집하려면 `contenteditable="true"`를 넣습니다.

## 사용

```sh
npm install shaderfont
```

브라우저에서 등록한 뒤 HTML에 넣습니다.

```js
import { registerShaderFont } from "shaderfont";

const result = await registerShaderFont();
if (!result.ok) throw new Error(result.error);
```

```html
<shader-font shader="hologram" drag-effect="dissolve">
  안녕하세요
</shader-font>
```

`shader`에는 `noise`, `plasma`, `aurora`, `cyber`, `flame`, `waves` 같은 재질을 고릅니다. 디졸브는 선택한 글자만 서서히 가리고 선택을 해제하면 복구하며, 나머지 드래그 효과(`move`, `shake`, `elastic`)는 요소 전체를 움직입니다. `reveal-effect="burn"`으로 시간에 따른 등장도 넣을 수 있습니다. 각 효과는 `none`으로 끄고, 색상과 시간은 따로 조절합니다.

## 동작 원리

브라우저가 글자를 배치하고, CSS의 `background-clip: text`가 움직이는 무늬를 글자 안에만 보여 줍니다. 디졸브는 브라우저의 선택 범위(`Selection/Range`)를 읽어 해당 부분에 노이즈 마스크를 씌웁니다. 기본 렌더러는 Canvas 2D이며 `renderer="webgl"`을 고르면 절차적 재질과 마스크에 WebGL 2를 사용합니다. 홀로그램과 이동 효과는 CSS로 처리하며, 폰트 파일을 만들거나 METAFONT를 실행하지는 않습니다.

루트 import는 SSR에서도 가능합니다. `registerShaderFont()`는 브라우저에서만 호출하고, 즉시 등록하는 `shaderfont/browser`도 브라우저에서만 사용합니다.

### CSP와 색상

인라인 스타일을 제한하는 사이트에서는 `<shader-font>`를 등록할 때 서버가 발급한 nonce를 전달합니다.

```js
const result = await registerShaderFont({ styleNonce: trustedNonce });
if (!result.ok) throw new Error(result.error);
```

패키지는 스타일시트가 실제로 적용됐는지 확인합니다. 차단되면 `STYLES_BLOCKED`를 반환하며, 올바른 nonce로 다시 호출할 수 있습니다. DOM에서 임의의 nonce를 읽거나 CSP를 `unsafe-inline`으로 완화할 필요는 없습니다. 즉시 등록하는 `shaderfont/browser`에는 nonce 인자가 없으므로 CSP가 엄격한 페이지에서는 루트 등록 API를 사용합니다. 이미지도 제한한다면 절차적 재질과 디졸브·등장 마스크를 위해 `img-src`에 `data:`를 허용해야 합니다.

색상 우선순위는 `primary`·`secondary`·`accent` 속성, 요소나 상위에서 지정한 `--sf-primary`·`--sf-secondary`·`--sf-accent` CSS 변수, 기본 밝은 팔레트 순서입니다. 페이지 테마가 바뀌어도 저장된 색상은 자동으로 덮지 않습니다. 어두운 배경에서는 `SHADER_FONT_PALETTES.find(p => p.name === "dark")`의 세 색을 요소 속성에 지정하고, 밝은 배경으로 돌아올 때 다시 밝은 팔레트를 지정하면 됩니다. 전역 흰색 변수가 글자에 직접 지정한 색을 덮지도 않습니다.

## 데모

저장소를 복제한 뒤 실행합니다.

```sh
npm run demo
npm run check
npm run check:browser
```

브라우저 검사는 로컬 Chrome에 엄격한 CSP를 적용해 nonce 실패·재시도, 밝고 어두운 색상, 홀로그램 애니메이션, 절차적 재질, 선택 디졸브, 타오르는 등장 효과와 움직임 줄이기를 확인합니다.

[영어 데모](http://127.0.0.1:8766/demo/index.html)와 [한글 데모](http://127.0.0.1:8766/demo/index.ko.html)는 같은 설정과 편집 가능한 텍스트를 제공합니다.

[MIT 라이선스](./LICENSE).
