const copies = {
  en: {
    materials: {
      none: "None (plain text)", hologram: "Hologram", noise: "Noise", plasma: "Plasma",
      aurora: "Aurora", cyber: "Cyber", flame: "Flame", waves: "Waves"
    },
    hints: {
      none: "Native selection and editing",
      dissolve: "The effect stays until you clear the selection",
      move: "Drag the whole sentence to move it",
      shake: "Drag the whole sentence to shake it",
      elastic: "Pull the whole sentence, then release it"
    },
    states: { idle: "idle", pressed: "pressed", active: "active", selected: "selected", restoring: "restoring" },
    effects: { none: "none", dissolve: "dissolve", move: "move", shake: "shake", elastic: "elastic" },
    applySample: label => `Apply ${label} sample`,
    sampleText: name => `${name.toUpperCase()} text`,
    rendererError: code => `The effect could not run (${code}). Change the settings or reset it to try again.`
  },
  ko: {
    materials: {
      none: "없음 (일반 글자)", hologram: "홀로그램", noise: "노이즈", plasma: "플라즈마",
      aurora: "오로라", cyber: "사이버", flame: "불꽃", waves: "물결"
    },
    hints: {
      none: "브라우저 기본 선택·편집",
      dissolve: "드래그 후 선택을 해제할 때까지 유지",
      move: "문장 전체를 잡아 원하는 자리로 이동",
      shake: "문장 전체를 잡아 흔들기",
      elastic: "문장 전체를 당겼다가 놓기"
    },
    states: { idle: "대기", pressed: "누름", active: "진행", selected: "선택 유지", restoring: "복구" },
    effects: { none: "없음", dissolve: "디졸브", move: "이동", shake: "떨림", elastic: "탄성" },
    applySample: label => `${label} 샘플 적용`,
    sampleText: name => `${name.toUpperCase()} 글자`,
    rendererError: code => `효과를 실행하지 못했습니다 (${code}). 설정을 바꾸거나 초기화 후 다시 시도하세요.`
  }
};

export function demoCopy(language) {
  if (!Object.hasOwn(copies, language)) throw new Error(`Unsupported demo language: ${language}`);
  return copies[language];
}
