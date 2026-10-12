# Shaderfont

DOM 텍스트에 움직이는 재질, 드래그 효과, 자동 등장을 붙이는 Web Component입니다. 기존 폰트와 텍스트를 사용하고, 문장을 선택하거나 복사하고 직접 고쳐 쓸 수 있습니다. 폰트 파일을 만들거나 METAFONT를 실행하는 라이브러리는 아닙니다.

## 사용

```html
<script type="module" src="/src/shader-font.js"></script>

<shader-font shader="hologram" drag-effect="dissolve">
  안녕하세요
</shader-font>
```

렌더러는 두 가지입니다. `canvas2d`가 기본값이고, `webgl`은 WebGL 2 셰이더로 재질과 디졸브 알파를 계산합니다.

```html
<shader-font renderer="canvas2d">Canvas 2D로 계산</shader-font>
<shader-font renderer="webgl">WebGL로 계산</shader-font>
```

재질은 글자 안에서만 보입니다. SVG 글자나 캔버스 텍스트를 겹치는 대신, 브라우저가 조판한 글자에 `background-clip: text`를 적용합니다. 홀로그램과 이동·떨림·탄성은 CSS가 처리하며, `canvas2d`를 골라도 브라우저의 GPU 합성까지 끄는 것은 아닙니다.

## 재질

홀로그램에 여섯 재질을 더했습니다. 어떤 재질이든 드래그 효과는 따로 고릅니다.

| `shader` | 모양 |
|---|---|
| `none` | 일반 글자 |
| `hologram` | 스캔라인과 흔들리는 색 외곽 |
| `noise` | 천천히 흐르는 얼룩과 입자 |
| `plasma` | 여러 파동이 겹치는 색 띠 |
| `aurora` | 세로로 굽이치는 빛의 커튼 |
| `cyber` | 격자와 움직이는 광선 |
| `flame` | 위로 흐르는 불꽃 질감 |
| `waves` | 겹치는 물결 |

```html
<shader-font shader="flame" renderer="webgl"
  primary="#420809" secondary="#ff351e" accent="#ffe89d"
  speed="1.2" scale="1.3" drag-effect="dissolve">
  한글도 일반 글자처럼 선택하고 고쳐 쓸 수 있습니다.
</shader-font>
```

선택한 글자는 기본 2.4초 동안 타들어갑니다. 드래그를 놓아도 선택이 남아 있으면 끝까지 진행하고, 선택을 해제하면 서서히 복구합니다. 선택은 한 `<shader-font>` 안에서만 처리합니다. 선택 밖이나 줄 사이에는 디졸브를 적용하지 않으며, 선택 위치를 얻지 못했다고 문장 전체를 대신 지우지도 않습니다.

WebGL을 쓸 수 없거나 컨텍스트를 잃으면 효과를 멈추고 일반 글자를 보이게 복구하며 `shaderfont-error` 이벤트를 보냅니다. 이벤트의 `detail`에는 `renderer`, `code`, `message`, 실패한 `phase`가 들어갑니다. 자동으로 Canvas 2D로 바꾸거나 재시도하지 않습니다. 렌더러를 바꾸거나 `resetPosition()`을 호출해 다시 시도할 수 있습니다.

## 자동 등장

`reveal-effect="burn"`은 드래그 없이 글자를 나타나게 합니다. 노이즈 경계를 따라 글자가 드러나고, 새로 나타나는 가장자리만 흰색·노랑·주황으로 빛납니다. [Code Avarice의 burning-edges 설명](https://www.codeavarice.com/dev-blog/tutorial-burning-edges-dissolve-shader-in-unity)의 노이즈 임계값과 좁은 발광 띠 방식을 참고했습니다. Unity 코드나 에셋을 넣은 것은 아닙니다.

```html
<shader-font shader="none" drag-effect="none"
  reveal-effect="burn" reveal-ms="1800"
  reveal-interval-ms="5000">
  불타는 경계를 따라 나타나는 글자
</shader-font>
```

위 설정은 1.8초 동안 나타나고, 완전히 보이는 상태로 5초 기다린 뒤 다시 시작합니다. 반복 대기 `reveal-interval-ms="0"`이면 한 번만 등장합니다. `element.restartReveal()`로 다시 볼 수 있습니다. 기본값은 `reveal-effect="none"`이라 기존 글자가 자동으로 사라지지 않습니다.

`shader="flame"`은 글자 안의 불꽃 **재질**, `reveal-effect="burn"`은 글자를 드러내는 **등장 동작**입니다. 홀로그램·일반 글자·다른 재질과도 결합할 수 있고, 재질의 `speed`와 관계없이 `reveal-ms`가 등장 시간을 정합니다. 드래그 디졸브와 함께 켜면 두 마스크의 교집합을 사용하며, 자동 등장이 브라우저의 선택을 해제하지 않습니다.

등장 중에도 원본 DOM 텍스트는 선택·복사할 수 있습니다. 시스템의 움직임 줄이기 설정에서는 자동 등장을 생략하고 글자를 온전히 보여 줍니다. 화면 밖이나 숨겨진 탭에서는 시간을 멈추고 다시 보일 때 이어갑니다. 상태는 `data-reveal-state`의 `burning`, `holding`, `complete`, `paused` 등으로 확인할 수 있습니다.

## 옵션

| 속성 | 값 | 기본값 |
|---|---|---|
| `renderer` | `canvas2d`, `webgl` | `canvas2d` |
| `shader` | 위 재질 목록 | `hologram` |
| `speed` | `0`~`4`, 재질 속도 (`0`은 정지) | `1` |
| `scale` | `0.25`~`4`, 무늬 크기 (추가 재질) | `1` |
| `resolution` | `0.25`~`1`, 재질·자동 등장 이미지 해상도 비율 | `0.5` |
| `softness` | `0`~`1`, 색 경계 부드러움 (추가 재질) | `0.35` |
| `drag-effect` | `none`, `dissolve`, `move`, `shake`, `elastic` | `dissolve` |
| `reveal-effect` | `none`, `burn`, 드래그와 별개인 자동 등장 | `none` |
| `reveal-ms` | `200`~`10000`, 등장 시간(ms) | `1800` |
| `reveal-interval-ms` | `0`~`60000`, 등장 완료 후 반복 대기(ms), `0`은 한 번만 | `5000` |
| `primary` | 추가 재질은 6자리 hex, 홀로그램은 CSS 색상 | `#69efff` |
| `secondary` | 위와 같음 | `#ff946a` |
| `accent` | 위와 같음 | `#fff4bd` |
| `flow` | `reading`, `ltr`, `rtl`, `random` | `reading` |
| `roughness` | `0`~`0.48`, 침식 경계의 폭 | `0.26` |
| `dissolve-ms` | `200`~`10000`, 사라지는 시간(ms) | `2400` |
| `restore-ms` | `100`~`10000`, 복구 시간(ms) | 디졸브 `1800`, 탄성 `900` |
| `block` | 블록 요소로 표시 | 없음 |
| `interaction` | `select`, `move`, `none` (이전 API) | `select` |

`move`는 요소 전체를 옮겨 놓은 자리에 두고, `shake`는 드래그 거리에 따라 더 크게 떱니다. `elastic`은 잡아당겼다가 놓으면 감쇠 진동으로 돌아옵니다. 이 세 동작은 선택한 글자 조각이 아니라 요소 전체에 적용합니다.

`shader`, `drag-effect`, `reveal-effect`는 따로 고릅니다. 모두 `none`으로 두면 일반 텍스트처럼 쓸 수 있고, 에디터에서는 편집 중 드래그와 자동 등장을 꺼 두는 편이 좋습니다. 디졸브 모드에서는 문장 자체가 이동하지 않도록 텍스트 드래그앤드롭을 막으며, `none`에서는 브라우저 기본 선택과 편집을 그대로 둡니다.

`flow="reading"`은 선택한 줄 조각의 읽기 순서를 따르고, `ltr`·`rtl`은 지정 방향, `random`은 방향 없이 질감만 사용합니다. 색상은 `--sf-primary`, `--sf-secondary`, `--sf-accent` CSS 변수로도 지정할 수 있으며 변수가 속성보다 우선합니다. HTML의 잘못된 숫자는 기본값으로 처리하고 범위를 벗어난 숫자는 제한합니다.

표준 태그는 `<shader-font>`입니다. 스크립트 로더는 이전 `<shaderfont>` 별칭도 변환합니다. `interaction="move"`는 이전 이동 옵션이며, `interaction="none"`은 효과 종류와 관계없이 포인터 입력을 막습니다.

## 패키지와 SSR

`shaderfont`와 `shaderfont/options`는 서버에서 import할 수 있습니다. 브라우저에서 마운트한 뒤 등록합니다.

```js
import { registerShaderFont } from "shaderfont";

const result = await registerShaderFont(); // 브라우저의 effect/mount 경계
if (!result.ok) console.error(result.error);
```

등록 결과는 `{ ok: true }` 또는 `{ ok: false, error }`입니다. `shaderfont/browser`는 즉시 등록하는 스크립트용 진입점이므로 서버에서 import하지 않습니다. 프레임워크용 등록은 별칭을 변환하거나 문서 전체를 관찰하지 않습니다.

저장할 때는 텍스트와 옵션만 있으면 됩니다. `parseShaderFontOptions`로 종류·숫자 범위와 6자리 hex 색상을 검증하고, 성공한 값을 `shaderFontAttributes`로 HTML 속성에 옮깁니다. 저장용 검증은 잘못된 값을 오류로 반환하며, HTML 속성의 기본값 처리와는 다릅니다. 저장용 옵션의 `restoreMs` 기본값은 효과 종류와 관계없이 `1800`입니다.

## 구조

```text
src/
  index.js                서버에서도 읽을 수 있는 진입점, 브라우저 등록
  options.js              저장용 옵션 검증과 HTML 속성 변환
  shader-font.js          스크립트 등록과 이전 태그 호환
  shader-font-element.js  DOM, 선택 위치, 제스처와 CSS
  core.js                 상태 전이, 노이즈와 침식 시점 계산
  presets.js              재질 목록 (옵션·렌더러·데모가 공유)
  material-core.js        재질 수식과 CPU / GLSL 대조 커널
  material-renderer.js    재질 이미지 렌더링
  mask-renderer.js        Canvas 2D / WebGL 2 알파 마스크
  reveal-core.js          자동 등장 시간, 노이즈 경계와 발광 띠
  reveal-renderer.js      Canvas 2D / WebGL 2 등장 마스크·경계 색
  webgl-surface.js        셰이더 컴파일과 GPU 자원 수명
  *.d.ts                  TypeScript 선언
demo/                     옵션을 바꿔 보는 데모
test/                     단위 테스트와 브라우저 대조
```

각 요소가 `idle | pressed | active | selected | restoring` 상태를 갖습니다. 브라우저 Selection의 Range와 줄별 사각형이 디졸브 위치를 정하고, 같은 상태와 진행량을 두 렌더러에 전달합니다. 렌더러마다 제스처 로직을 따로 만들지 않습니다.

자동 등장은 별도의 시간 상태를 갖습니다. `commitMasks()` 한 곳에서 선택 디졸브와 등장 마스크를 합쳐, 한 효과의 복구가 다른 효과를 지우지 않게 합니다. 글자 모양은 여전히 브라우저의 텍스트가 소유합니다.

디졸브 노이즈와 침식 시점은 선택·텍스트·배치가 바뀔 때 준비합니다. 도메인 워핑과 세 단계 노이즈로 큰 덩어리부터 미세 입자까지 만들며, 부드러운 경계를 거쳐 사라집니다. 마스크는 최대 131,072픽셀이며, 같은 진행 단계는 다시 인코딩하지 않고 디졸브가 끝나면 마스크 프레임을 멈춥니다. 옵션 변경·입력 취소·요소 제거 때 남은 작업을 정리하고, WebGL 마스크는 복구가 끝났을 때도 해제합니다.

추가 재질은 최대 65,536픽셀, 초당 최대 30회로 갱신합니다. 화면 밖이나 숨겨진 탭에서는 멈추며 WebGL 재질 자원을 해제합니다. 다시 보이면 숨겨진 시간을 건너뛰지 않고 이어갑니다. `speed="0"`과 시스템의 움직임 줄이기 설정에서는 정지 화면을 사용합니다. 데모 샘플은 가리키거나 포커스할 때만 움직입니다. [IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver)와 [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)를 사용합니다.

자동 등장도 최대 65,536픽셀, 초당 최대 30회로 갱신합니다. 완전히 보이는 대기 상태에서는 프레임 루프와 GPU 자원을 멈춥니다. 등장 중에는 알파 마스크와 경계 색 이미지 두 장을 변환하므로 재질만 켠 경우보다 비용이 큽니다. 짧은 제목부터 적용하고 긴 본문 전체나 여러 요소를 동시에 움직일 때는 실측하는 편이 좋습니다.

WebGL에서도 CSS 마스크로 넘기는 PNG 변환은 남습니다. 글자가 적으면 Canvas 2D가 더 나을 수 있으므로 WebGL을 항상 빠른 버전으로 보지는 않습니다. 여러 글자를 동시에 움직일 때의 비용과 브라우저별 호환성은 사용 환경에서 확인해야 합니다.

## 설치와 개발

현재 저장소와 패키지는 비공개이며 npm에 발행하지 않았습니다. 실행 의존성은 없고, 로컬 묶음으로 설치합니다.

```sh
npm pack --pack-destination /path/to/makonea/vendor/shaderfont
# Makonea의 apps/web에서 실행
pnpm add ../../vendor/shaderfont/shaderfont-0.4.0.tgz
```

```text
npm run check
npm run demo
```

데모는 `http://127.0.0.1:8766/`에서 열립니다. `/test/browser/renderers.html`은 디졸브 알파를, `/test/browser/materials.html`은 재질 RGB를, `/test/browser/reveal.html`은 등장 알파와 경계 색을 대조합니다. 선택·복구·컨텍스트 손실도 확인합니다. 각 검사는 보이는 탭에서 하나씩 실행합니다. 단위 테스트만으로 GPU 실행을 확인했다고 보지는 않습니다.

## 공개 배포 전

먼저 라이선스를 정해야 합니다. 지금은 `private: true`, `UNLICENSED`라 공개 배포와 재사용을 허용하는 설정이 아닙니다. 이름과 배포 파일을 확인하고, 브라우저별 테스트를 거친 뒤 실험판으로 내는 것을 검토하고 있습니다. [npm의 패키지 설정 안내](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)에 공개 설정과 라이선스 설명이 있습니다.

저장소를 비공개로 유지해도 브라우저에서 실행하는 코드는 방문자에게 전달됩니다. 비공개 Git 저장소가 브라우저 코드의 비밀성을 보장하지는 않습니다.
