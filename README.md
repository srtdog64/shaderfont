# Shaderfont

일반 DOM 텍스트에 홀로그램과 네 가지 드래그 효과를 적용하는 작은 Web Component입니다. 각 축에는 명시적인 `none`이 있으며, 캔버스에 문장을 다시 그리지 않으므로 선택, 복사, 검색, 접근성 트리, `contenteditable`을 그대로 유지합니다.

```html
<script type="module" src="/src/shader-font.js"></script>

<shader-font shader="hologram" drag-effect="dissolve">
  안녕하세요
</shader-font>
```

HTML Custom Element의 표준 이름에는 하이픈이 필요합니다. 따라서 정식 API는 `<shader-font>...</shader-font>`입니다. 요청한 `<shaderfont>...</shaderfont>`도 로더가 같은 요소로 자동 변환하지만, 새 코드에는 표준 이름을 권합니다.

## 설계 계약

- 목표: 실제 텍스트의 의미와 편집성을 유지하면서 홀로그램과 교체 가능한 드래그 효과를 적용한다.
- 우선순위: DOM 의미 보존 → 결정적인 상태 전이 → 문장 흐름 → 시각 효과.
- 상태 소유자: 각 `<shader-font>` 인스턴스가 자신의 `idle | pressed | active | selected | restoring` 상태를 가진다.
- 위치 소유자: `drag-effect="dissolve"`에서는 브라우저 Selection의 Range와 줄별 client rect가 디졸브 영역을 결정한다.
- 금지된 폴백: 디졸브가 선택 배경 사각형을 지우거나, 선택 위치를 얻지 못했을 때 문장 전체를 대신 지우지 않는다.
- 검증 기준: 선택한 줄 조각 바깥의 픽셀은 그대로 남고, 포인터를 놓으면 `selected`로 진행·유지하며, 선택 해제 후 `idle`과 완전 표시 상태로 돌아온다.

## 옵션

| 속성 | 값 | 기본값 |
|---|---|---|
| `shader` | `hologram`, `none` | `hologram` |
| `primary` | CSS 색상 | `#69efff` |
| `secondary` | CSS 색상 | `#ff946a` |
| `accent` | CSS 색상 | `#fff4bd` |
| `drag-effect` | `none`, `dissolve`, `move`, `shake`, `elastic` | `dissolve` |
| `flow` | `reading`, `ltr`, `rtl`, `random` | `reading` |
| `interaction` | `select`, `move`, `none` (이전 API 및 전체 비활성화) | `select` |
| `roughness` | `0`~`0.48`, 침식 전선의 폭 | `0.26` |
| `dissolve-ms` | 선택 영역이 완전히 침식되는 시간(ms), `200`~`10000` | `2400` |
| `restore-ms` | 복구 시간(ms) | 디졸브 `1800`, 탄성 `900` |
| `block` | 블록 문장으로 표시 | 없음 |

스타일시트에서는 `--sf-primary`, `--sf-secondary`, `--sf-accent`로 색상을 덮어쓸 수도 있습니다. CSS 변수가 속성보다 우선합니다.

`shader="none"`은 글자 재질만 일반 텍스트로 되돌립니다. `drag-effect="none"`은 별도의 드래그 상태를 만들지 않고 브라우저의 기본 선택과 `contenteditable` 편집을 그대로 둡니다. 둘은 독립적이므로 일반 글자에 탄성을 주거나, 홀로그램 글자를 기본 방식으로 선택하는 조합도 가능합니다. `interaction="none"`은 이와 달리 포인터 입력 자체를 완전히 막는 이전 API입니다.

## 실제 사용

홀로그램 색과 디졸브 질감을 함께 조정하는 예입니다.

```html
<shader-font
  shader="hologram"
  drag-effect="dissolve"
  primary="#69efff"
  secondary="#ff946a"
  accent="#fff4bd"
  roughness="0.26"
  dissolve-ms="2400"
  restore-ms="1800">
  안녕하세요
</shader-font>
```

효과를 모두 끄면 같은 요소를 평범한 본문처럼 쓸 수 있습니다.

```html
<shader-font shader="none" drag-effect="none" contenteditable="true">
  선택하고 고쳐 쓸 수 있는 일반 텍스트
</shader-font>
```

시각 재질과 동작은 따로 고를 수 있습니다.

```html
<shader-font shader="hologram" drag-effect="elastic" restore-ms="900">
  잡아당기면 탄성 있게 돌아오는 글자
</shader-font>
```

`shader`와 `drag-effect`는 종류를 고르는 옵션이고, 세 색상·`roughness`·`dissolve-ms`·`restore-ms`는 선택한 효과의 모양과 시간을 조정합니다. 문단처럼 줄바꿈되는 요소가 필요하면 `block`을 함께 지정합니다.

## 선택 위치 기반 디졸브

`drag-effect="dissolve"`에서는 브라우저가 계산한 Range의 줄별 사각형을 마스크 좌표로 옮깁니다. 이 사각형은 어디가 침식되는지만 정하고, 진행량은 선택이 시작된 뒤 경과한 시간으로 계산합니다. 기본값에서는 2.4초에 선택 영역이 완전히 사라집니다. 포인터를 놓아도 Selection이 남아 있으면 애니메이션이 끝까지 이어지고, 완료된 결과가 유지됩니다. 바깥을 클릭하거나 선택을 해제하면 `restore-ms` 동안 서서히 복구합니다. 네모난 Selection 배경은 투명하게 두고 글자의 실제 페인트와 마스크만 합성하므로 여러 줄을 드래그해도 줄 사이와 선택 밖의 글자는 건드리지 않습니다. 선택 밖 글자의 투명도는 낮추지 않습니다.

도메인 워핑된 세 단계 노이즈가 큰 덩어리, 중간 균열, 미세 입자를 결정합니다. 침식 시점은 전체 시간에 분산되며 부드러운 경계를 거쳐 사라집니다. `flow="reading"`은 선택한 줄 조각의 읽기 순서, `ltr`·`rtl`은 지정 방향, `random`은 방향 없이 질감만 사용합니다. DOM 텍스트와 선택 자체는 브라우저가 계속 소유하므로 복사, 검색, 접근성 트리와 `contenteditable`은 유지됩니다.

노이즈·선택 좌표·침식 시점은 입력이나 배치가 바뀔 때 준비하고, 진행 프레임에서는 알파 값만 갱신합니다. 인스턴스마다 캔버스와 픽셀 버퍼를 재사용하며 마스크는 최대 131,072픽셀로 제한합니다. 동일 진행 단계는 다시 인코딩하지 않고, 완료된 선택 상태에서는 프레임을 예약하지 않습니다. 옵션 변경, 입력 취소, 요소 제거 시 남은 프레임과 복구 타이머를 정리합니다.

디졸브 모드에서 다시 드래그하면 새 선택이 시작됩니다. 브라우저의 텍스트 드래그앤드롭은 이 모드에서 차단해 문장 자체가 옮겨지지 않도록 합니다. `drag-effect="none"`에서는 브라우저 기본 동작을 유지합니다. 숫자 옵션이 비어 있거나 유효하지 않으면 표의 기본값을 사용합니다.

## 드래그 효과 4종

- `dissolve`: 선택한 글리프만 침식하고, 놓은 뒤에도 유지하며 선택을 해제하면 복구합니다.
- `move`: 요소 전체를 잡아 옮기며 놓은 위치를 유지합니다.
- `shake`: 드래그 거리에 따라 글자 전체가 더 크게 떨립니다.
- `elastic`: 끄는 방향으로 이동·회전·늘어난 뒤 감쇠 진동으로 제자리로 돌아옵니다.

`none`은 별도 효과가 아니라 이 네 가지 동작을 사용하지 않는 명시적인 값입니다.

`interaction="move"`만 쓰던 기존 마크업은 `drag-effect="move"`로 해석됩니다. `interaction="none"`은 선택한 효과와 관계없이 포인터 동작을 끕니다.

## 실행

```text
npm run check
npm run demo
```

데모는 `http://127.0.0.1:8766/`에서 열립니다.
