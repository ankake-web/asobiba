// あそびば — 共通サウンドキット（WebAudio・軽量）
// 各ゲームは自前の効果音を持つが、ハブと共通UIはこれを使う。
let ctx = null;
let enabled = localStorage.getItem("asobiba:sound") !== "off";

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function isSoundOn() {
  return enabled;
}

export function setSound(on) {
  enabled = on;
  localStorage.setItem("asobiba:sound", on ? "on" : "off");
  if (on) tone(720, 0.07, "triangle", 0.05);
}

export function toggleSound() {
  setSound(!enabled);
  return enabled;
}

export function tone(freq = 440, dur = 0.08, type = "triangle", vol = 0.05) {
  if (!enabled) return;
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g);
  g.connect(c.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.stop(c.currentTime + dur);
}

export function seq(notes, step = 0.12, type = "triangle", vol = 0.045) {
  if (!enabled) return;
  const c = ac();
  notes.forEach((f, i) => {
    if (!f) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    o.connect(g);
    g.connect(c.destination);
    const t = c.currentTime + i * step;
    o.start(t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
    o.stop(t + step);
  });
}

export const sfx = {
  hover: () => tone(620, 0.03, "sine", 0.03),
  select: () => tone(540, 0.05, "square", 0.035),
  enter: () => seq([523, 659, 784], 0.1, "triangle", 0.05),
  back: () => tone(360, 0.07, "sine", 0.04),
};
