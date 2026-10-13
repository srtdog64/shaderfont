import { SHADER_PRESETS } from "../src/options.js";
import { demoCopy } from "./copy.js";

const copy = demoCopy(document.documentElement.lang);
const sentence = document.querySelector("#sentence");
const status = document.querySelector("#status");
const gestureHint = document.querySelector("#gesture-hint");
const rendererError = document.querySelector("#renderer-error");
const hints = copy.hints;
const shaderSelect = document.querySelector("#shader");
for (const preset of SHADER_PRESETS) {
  const option = document.createElement("option");
  option.value = preset.name;
  option.textContent = copy.materials[preset.name];
  shaderSelect.append(option);
}
shaderSelect.value = "hologram";
const fields = ["renderer", "shader", "primary", "secondary", "accent", "flow", "roughness", "dissolve-ms", "drag-effect", "speed", "scale", "resolution", "softness", "reveal-effect", "reveal-ms", "reveal-interval-ms"];
function updateExample() {
  const attributes = fields.map(name => `  ${name}="${sentence.getAttribute(name) ?? document.querySelector(`#${name}`).value}"`).join("\n");
  const text = sentence.textContent.trim().replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  document.querySelector("#example").textContent = `<script type="module" src="/src/shader-font.js"><\/script>\n\n<shader-font\n${attributes}\n  restore-ms="1800">\n  ${text}\n</shader-font>`;
}
for (const name of fields) {
  document.querySelector(`#${name}`).addEventListener("input", event => {
    if (name === "renderer") rendererError.hidden = true;
    sentence.setAttribute(name, event.target.value);
    if (name === "renderer") for (const sample of document.querySelectorAll(".preset-card shader-font")) sample.setAttribute(name, event.target.value);
    updateExample();
  });
}
sentence.addEventListener("input", updateExample);
document.querySelector("#reveal-effect").addEventListener("input", event => {
  const enabled = event.target.value !== "none";
  document.querySelector("#reveal-settings").open = enabled;
  document.querySelector("#replay-reveal").disabled = !enabled;
});
document.querySelector("#replay-reveal").addEventListener("click", () => sentence.restartReveal());
document.querySelector("#drag-effect").addEventListener("input", event => {
  gestureHint.textContent = hints[event.target.value];
  status.textContent = `${copy.states.idle} / ${copy.effects[event.target.value]} / 0%`;
});
document.querySelector("#reset").addEventListener("click", () => {
  rendererError.hidden = true;
  sentence.resetPosition();
});
sentence.addEventListener("shaderfont-error", event => {
  rendererError.hidden = false;
  rendererError.textContent = copy.rendererError(event.detail.code);
});
sentence.addEventListener("shaderfont-state", event => {
  status.textContent = `${copy.states[event.detail.state]} / ${copy.effects[event.detail.effect]} / ${Math.round(sentence.effectProgress * 100)}%`;
});
sentence.addEventListener("shaderfont-progress", event => {
  status.textContent = `${copy.states[event.detail.state]} / ${copy.effects[event.detail.effect]} / ${Math.round(event.detail.progress * 100)}%`;
});
const palettes = {
  noise: ["#a81120", "#fd3039", "#ffc57a"],
  plasma: ["#3e0e89", "#e752ce", "#71f4ff"],
  aurora: ["#043b53", "#31c896", "#af8df5"],
  cyber: ["#052045", "#28abdd", "#d6fbff"],
  flame: ["#420809", "#ff351e", "#ffe89d"],
  waves: ["#063b70", "#009fd0", "#c4fff8"]
};
for (const preset of SHADER_PRESETS.filter(preset => preset.id >= 2)) {
  const button = document.createElement("button");
  button.className = "preset-card";
  button.type = "button";
  button.setAttribute("aria-label", copy.applySample(copy.materials[preset.name]));
  const sample = document.createElement("shader-font");
  sample.setAttribute("shader", preset.name);
  sample.setAttribute("renderer", "canvas2d");
  sample.setAttribute("drag-effect", "none");
  sample.setAttribute("speed", "0");
  sample.setAttribute("resolution", "0.35");
  sample.setAttribute("aria-hidden", "true");
  sample.textContent = copy.sampleText(preset.name);
  ["primary", "secondary", "accent"].forEach((name, index) => sample.setAttribute(name, palettes[preset.name][index]));
  const label = document.createElement("span");
  label.textContent = copy.materials[preset.name];
  button.append(sample, label);
  const play = () => sample.setAttribute("speed", "1");
  const stop = () => sample.setAttribute("speed", "0");
  button.addEventListener("pointerenter", play);
  button.addEventListener("pointerleave", stop);
  button.addEventListener("focus", play);
  button.addEventListener("blur", stop);
  button.addEventListener("click", () => {
    sentence.setAttribute("shader", preset.name);
    shaderSelect.value = preset.name;
    ["primary", "secondary", "accent"].forEach((name, index) => {
      const color = palettes[preset.name][index];
      sentence.setAttribute(name, color);
      document.querySelector(`#${name}`).value = color;
    });
    updateExample();
  });
  document.querySelector("#presets").append(button);
}
updateExample();
