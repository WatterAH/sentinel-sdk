// ─────────────────────────────────────────────────────────────────────────────
// VelocityDetector
// Responsabilidad: detectar si los hits ocurrieron en ráfaga corta
// ─────────────────────────────────────────────────────────────────────────────

import type { Hit } from "../types/SentinelEngine.js";

export class VelocityDetector {
  private windowSeconds: number;
  private minHits: number;

  constructor(windowSeconds = 300, minHits = 3) {
    this.windowSeconds = windowSeconds;
    this.minHits = minHits;
  }

  /** Verifica si los hits ocurrieron dentro de una ventana temporal corta. */
  check(hits: Hit[]): { flag: boolean; windowSeconds: number } {
    if (hits.length < this.minHits) return { flag: false, windowSeconds: 0 };

    const timestamps = hits.map((h) => h.timestamp).sort((a, b) => a - b);
    const first = timestamps[0]!;
    const last = timestamps[timestamps.length - 1]!;
    const windowSeconds = Math.round((last - first) / 1000);

    return windowSeconds <= this.windowSeconds
      ? { flag: true, windowSeconds }
      : { flag: false, windowSeconds };
  }
}
