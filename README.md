# Shaderfont

일반 DOM 텍스트에 홀로그램과 문장 단위 디졸브를 적용하는 작은 Web Component입니다. 캔버스에 문장을 다시 그리지 않으므로 선택, 복사, 검색, 접근성 트리, `contenteditable`을 그대로 유지합니다.

```html
<script type="module" src="/src/shader-font.js"></script>

<shader-font primary="#69efff" secondary="#ff946a">
  안녕하세요
</shader-font>
```

HTML Custom Element의 표준 이름에는 하이픈이 필요합니다. 따라서 정식 API는 `<shader-font>...</shader-font>`입니다. 요청한 `<shaderfont>...</shaderfont>`도 로더가 같은 요소로 자동 변환하지만, 새 코드에는 표준 이름을 권합니다.

## 설계 계약

- 목표: 실제 텍스트의 의미와 편집성을 유지하면서 글자 내부에만 홀로그램·디졸브 효과를 적용한다.
- 우선순위: DOM 의미 보존 → 결정적인 상태 전이 → 문장 흐름 → 시각 효과.
- 상태 소유자: 각 `<shader-font>` 인스턴스가 자신의 `idle | pressed | active | restoring` 상태를 가진다.
- 금지된 폴백: 문장 크기와 무관한 반복 노이즈가 디졸브 위치를 결정하지 않는다.
- 검증 기준: 읽기 방향 테스트에서 사라진 영역이 진행 방향을 따르고, 놓은 뒤 반드시 `idle`과 완전 표시 상태로 돌아온다.

## 옵션

| 속성 | 값 | 기본값 |
|---|---|---|
| `primary` | CSS 색상 | `#69efff` |
| `secondary` | CSS 색상 | `#ff946a` |
| `accent` | CSS 색상 | `#fff4bd` |
| `flow` | `reading`, `ltr`, `rtl`, `random` | `reading` |
| `interaction` | `select`, `move`, `none` | `select` |
| `roughness` | `0`~`0.48`, 침식 전선의 폭 | `0.26` |
| `restore-ms` | 복구 시간(ms) | `1800` |
| `block` | 블록 문장으로 표시 | 없음 |

스타일시트에서는 `--sf-primary`, `--sf-secondary`, `--sf-accent`로 색상을 덮어쓸 수도 있습니다. CSS 변수가 속성보다 우선합니다.

## 문장 기반 디졸브

기본 `flow="reading"`은 요소의 실제 폭, 높이, 줄 높이를 사용해 각 픽셀에 읽기 순서 좌표를 부여합니다. 이 좌표는 침식이 이동할 큰 방향만 정합니다. 넓은 전이 구간 안에서는 도메인 워핑된 세 단계 노이즈가 큰 덩어리, 중간 균열, 미세 입자를 각각 지우므로 직선 와이프가 아니라 텍스처가 타들어가는 형태가 됩니다. `flow="random"`은 문장 방향 없이 같은 침식 텍스처만 적용합니다.

## 실행

```text
npm run check
npm run demo
```

데모는 `http://127.0.0.1:8766/`에서 열립니다.
