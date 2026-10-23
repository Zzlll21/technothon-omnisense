// Presentation coordinates only. The supplied normalized configuration is not a room survey.
export function officePosition(x: number, y: number) {
  const unit = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
  return { x: (unit(x) - 0.5) * 6, y: 2.64, z: -1.85 + unit(y) * 4.2 };
}
export function coverageRect(x: number, z: number) {
  return { left: Math.max(-3.29, x - 1.475), right: Math.min(3.29, x + 1.475), back: Math.max(-2.36, z - 1.7), front: Math.min(2.36, z + 1.7) };
}
export const cameraLimits = { minZoom: 0.9, maxZoom: 1.6, minAzimuth: -Math.PI * 0.38, maxAzimuth: Math.PI * 0.42 };
export const cameraMotion = { zoomStep: 1.12, zoomRate: 0.42, rotationRate: Math.PI / 6, rotationStep: Math.PI / 12, duration: 180 };
// Retains the prototype's interruptible cubic-bezier(.23,1,.32,1) adjustment.
export function cameraEase(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let s = t;
  for (let i = 0; i < 6; i++) {
    const u = 1 - s, x = 3 * .23 * s * u * u + 3 * .32 * s * s * u + s * s * s;
    const dx = 3 * .23 * u * u + 6 * (.32 - .23) * u * s + 3 * (1 - .32) * s * s;
    s = Math.max(0, Math.min(1, s - (x - t) / dx));
  }
  return 1 - (1 - s) ** 3;
}
