# Shaderfont

일반 웹 텍스트에 홀로그램 같은 재질과 드래그 효과를 붙이는 Web Component입니다. 기존 폰트와 DOM 텍스트를 그대로 써서 선택·복사가 가능하며, 색상과 움직임을 옵션으로 고릅니다.

```html
<script type="module" src="/src/shader-font.js"></script>

<shader-font shader="hologram" drag-effect="dissolve">
  안녕하세요
</shader-font>
```

디졸브는 드래그로 선택한 글자만 서서히 지우고, 선택을 해제하면 복구합니다. 이동·떨림·탄성과 불타는 자동 등장도 따로 고를 수 있습니다.

## 동작 원리

브라우저가 글자를 배치하고, CSS의 `background-clip: text`가 움직이는 무늬를 글자 안에만 보여 줍니다. 디졸브는 브라우저의 선택 범위(`Selection/Range`)를 읽어 해당 부분에 노이즈 마스크를 씌우는 방식입니다. 기본 계산은 Canvas 2D이며 `renderer="webgl"`을 고르면 WebGL 2를 사용합니다. 홀로그램과 이동·떨림·탄성은 CSS 효과입니다. 폰트 파일을 만들거나 METAFONT를 실행하지는 않습니다.

## 실행

```sh
npm run demo
npm run check
```

데모는 [127.0.0.1:8766](http://127.0.0.1:8766/)에서 열립니다. SSR에서는 `shaderfont`를 import한 뒤 브라우저에서 `registerShaderFont()`로 등록합니다.

소스 저장소는 공개입니다. npm에는 아직 배포하지 않았으며, 패키지의 `private: true`와 `UNLICENSED` 설정은 유지합니다.
