export const ShaderPreset = Object.freeze({
  NONE: "none", HOLOGRAM: "hologram", NOISE: "noise", PLASMA: "plasma",
  AURORA: "aurora", CYBER: "cyber", FLAME: "flame", WAVES: "waves"
});

export const SHADER_PRESETS = Object.freeze([
  { name: "none", label: "없음 (일반 글자)", id: 0 },
  { name: "hologram", label: "홀로그램", id: 1 },
  { name: "noise", label: "노이즈", id: 2 },
  { name: "plasma", label: "플라즈마", id: 3 },
  { name: "aurora", label: "오로라", id: 4 },
  { name: "cyber", label: "사이버", id: 5 },
  { name: "flame", label: "불꽃", id: 6 },
  { name: "waves", label: "물결", id: 7 }
].map(Object.freeze));

export function isProceduralShader(name) {
  return SHADER_PRESETS.some(preset => preset.name === name && preset.id >= 2);
}
