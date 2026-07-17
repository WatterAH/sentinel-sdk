import { describe, expect, it } from "vitest";
import { Engine } from "./engine.js";
import { NormalizerLayer } from "./normalizer-layer.js";

describe("normalización de transcripciones de voz", () => {
  it("retira pausas y muletillas para recomponer una frase V3", () => {
    const normalizer = new NormalizerLayer();
    const output = normalizer.process([
      { text: "eh... manda... este... tu ubicación", source: "voice_transcript", timestamp: 1 },
    ]);

    expect(output.messages[0].text).toContain("manda tu ubicacion");
    expect(output.transformations).toContain("voice-filler:hesitation");
    expect(output.transformations).toContain("voice-filler:este");
    expect(output.transformations).toContain("voice-pause-cleanup");
  });

  it("aplica la tolerancia solo a voz, no al mismo texto escrito", () => {
    const raw = "manda... este... tu ubicación";
    const voice = new Engine().analyze([
      { text: raw, source: "voice_transcript", timestamp: 1 },
    ]);
    const text = new Engine().analyze([{ text: raw, source: "text", timestamp: 1 }]);

    expect(voice.layers.v3.terms).toContain("LF-002");
    expect(text.layers.v3.terms).not.toContain("LF-002");
  });

  it("recupera varias frases ruidosas sin bajar el umbral de riesgo", () => {
    const noisyVoice = new Engine().analyze([
      { text: "eh... hay... este... jale", source: "voice_transcript", timestamp: 1 },
      { text: "te pago... pues... bien", source: "voice_transcript", timestamp: 2 },
      { text: "manda... o sea... tu ubicación", source: "voice_transcript", timestamp: 3 },
    ]);
    const cleanText = new Engine().analyze([
      { text: "hay jale", timestamp: 1 },
      { text: "te pago bien", timestamp: 2 },
      { text: "manda tu ubicación", timestamp: 3 },
    ]);

    expect(noisyVoice.risk).toBe(cleanText.risk);
    expect(noisyVoice.score).toBe(cleanText.score);
    expect(noisyVoice.layers.v3.terms).toEqual(cleanText.layers.v3.terms);
  });

  it("no convierte higiene Unicode de ASR en evidencia de evasión", () => {
    const voice = new Engine().analyze([
      { text: "ｍｍｍ hola, vamos al cine", source: "voice_transcript", timestamp: 1 },
    ]);
    const text = new Engine().analyze([{ text: "h4lc0n", source: "text", timestamp: 1 }]);

    expect(voice.layers.normalizer.triggeredRules).not.toContain("N0-EVASION");
    expect(text.layers.normalizer.triggeredRules).toContain("N0-EVASION");
  });

  it("mantiene bajo un contexto benigno con el mismo ruido oral", () => {
    const result = new Engine().analyze([
      {
        text: "eh... el profe dijo que vamos a repartir... este... las hojas por cada banca",
        source: "voice_transcript",
        timestamp: 1,
      },
    ]);
    expect(result.risk).toBe("LOW");
  });
});
