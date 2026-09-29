import "./style.css";
import { Engine } from "../../typescript/src/analyzer/engine.ts";
import type { Message } from "../../typescript/src/types/SentinelEngine.ts";

type Example = { label: string; messages: Array<{ sender: string; text: string }> };

const examples: Record<string, Example> = {
  obvious: {
    label: "Reclutamiento obvio",
    messages: [
      { sender: "desconocido", text: "hay jale para ti, pagan buena lana" },
      { sender: "menor", text: "qué tendría que hacer?" },
      { sender: "desconocido", text: "manda tu ubicación y te recogemos, no le digas a nadie" },
    ],
  },
  obfuscated: {
    label: "Mensaje ofuscado",
    messages: [
      { sender: "desconocido", text: "ｈａｙ ｊａｌｅ ｄｅ ｈａｌｃｏｎ" },
      { sender: "desconocido", text: "5 mil kincenales, p4go en efectivo" },
      { sender: "desconocido", text: "m4nd4 tu ub1c4c10n" },
    ],
  },
  benign: {
    label: "Conversación benigna",
    messages: [
      { sender: "amiga", text: "ya terminaste la tarea de historia?" },
      { sender: "menor", text: "todavía no, hacemos llamada después de cenar" },
      { sender: "amiga", text: "va, te paso mis apuntes del salón" },
    ],
  },
};

const engine = new Engine();
let messages: Message[] = [];
let selectedSender = "desconocido";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Playground root not found");

app.innerHTML = `
  <header class="hero">
    <div><span class="eyebrow">SENTINEL · ON-DEVICE</span><h1>Explora el motor local</h1><p>Observa cómo cambian las señales conforme avanza una conversación.</p></div>
    <div class="privacy-chip">100% en este navegador</div>
  </header>
  <aside class="disclaimer"><strong>Demostración técnica:</strong> usa únicamente el motor determinista local. No llama a Groq, no incluye la capa cognitiva y no sustituye una evaluación profesional.</aside>
  <nav class="examples" aria-label="Ejemplos precargados">
    ${Object.entries(examples).map(([id, example]) => `<button data-example="${id}">${example.label}</button>`).join("")}
    <button id="clear" class="secondary">Limpiar</button>
  </nav>
  <main class="workspace">
    <section class="chat-card" aria-labelledby="chat-title">
      <div class="section-head"><div><span class="eyebrow">SIMULADOR</span><h2 id="chat-title">Conversación</h2></div><span id="message-count">0 mensajes</span></div>
      <div id="chat" class="chat" aria-live="polite"></div>
      <div class="composer">
        <div class="sender-toggle" role="group" aria-label="Emisor del mensaje">
          <button data-sender="desconocido" class="active">Desconocido</button>
          <button data-sender="menor">Menor</button>
        </div>
        <div class="compose-row"><textarea id="message" rows="2" maxlength="1000" placeholder="Escribe un mensaje…"></textarea><button id="send" class="primary">Analizar</button></div>
      </div>
    </section>
    <aside class="analysis-card" aria-labelledby="analysis-title">
      <div class="section-head"><div><span class="eyebrow">LECTURA EN VIVO</span><h2 id="analysis-title">Desglose del motor</h2></div><span id="risk" class="risk low">LOW</span></div>
      <div class="total-score"><span>Score global</span><strong id="score">0</strong><span>/ 100</span></div>
      <div id="layers" class="layers"></div>
      <div class="details"><h3>Términos detectados</h3><div id="terms" class="tags"><span class="empty">Ninguno</span></div></div>
      <div class="details"><h3>Categorías</h3><div id="categories" class="tags"><span class="empty">Ninguna</span></div></div>
      <div class="details"><h3>Reglas activadas</h3><div id="rules" class="tags"><span class="empty">Ninguna</span></div></div>
    </aside>
  </main>
`;

const chat = document.querySelector<HTMLDivElement>("#chat")!;
const input = document.querySelector<HTMLTextAreaElement>("#message")!;

function renderTags(containerId: string, values: string[], empty: string): void {
  const container = document.querySelector<HTMLDivElement>(`#${containerId}`)!;
  container.replaceChildren();
  if (!values.length) {
    const span = document.createElement("span");
    span.className = "empty";
    span.textContent = empty;
    container.append(span);
    return;
  }
  for (const value of values) {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = value;
    container.append(span);
  }
}

function render(): void {
  chat.replaceChildren();
  for (const message of messages) {
    const bubble = document.createElement("article");
    bubble.className = `bubble ${message.sender === "menor" ? "minor" : "other"}`;
    const sender = document.createElement("small");
    sender.textContent = message.sender === "menor" ? "Menor" : "Interlocutor";
    const text = document.createElement("p");
    text.textContent = message.text;
    bubble.append(sender, text);
    chat.append(bubble);
  }
  document.querySelector("#message-count")!.textContent = `${messages.length} mensaje${messages.length === 1 ? "" : "s"}`;

  const result = engine.analyze(messages);
  const risk = document.querySelector<HTMLSpanElement>("#risk")!;
  risk.textContent = result.risk;
  risk.className = `risk ${result.risk.toLowerCase()}`;
  document.querySelector("#score")!.textContent = String(result.score);

  const layers = [
    ["Normalización", result.layers.normalizer.score],
    ["Léxico V3", result.layers.v3.score],
    ["Señales V4", result.layers.v4.score],
  ] as const;
  const layerRoot = document.querySelector<HTMLDivElement>("#layers")!;
  layerRoot.innerHTML = layers.map(([name, score]) => `<div class="layer"><div><span>${name}</span><strong>${score}</strong></div><div class="bar"><i style="width:${Math.min(score, 100)}%"></i></div></div>`).join("");

  renderTags("terms", result.layers.v3.terms, "Ninguno");
  renderTags("categories", result.uniqueCategories, "Ninguna");
  renderTags(
    "rules",
    [
      ...result.layers.normalizer.triggeredRules,
      ...result.layers.v3.triggeredRules,
      ...result.layers.v4.triggeredRules,
      ...result.layers.temporal.triggeredRules,
      ...result.layers.actor.triggeredRules,
    ],
    "Ninguna",
  );
  chat.scrollTop = chat.scrollHeight;
}

function addMessage(): void {
  const text = input.value.trim();
  if (!text) return;
  messages.push({ text, sender: selectedSender, timestamp: Date.now() });
  input.value = "";
  render();
  input.focus();
}

document.querySelector("#send")!.addEventListener("click", addMessage);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    addMessage();
  }
});

document.querySelectorAll<HTMLButtonElement>("[data-sender]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedSender = button.dataset.sender ?? "desconocido";
    document.querySelectorAll("[data-sender]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    const example = examples[button.dataset.example ?? ""];
    if (!example) return;
    const base = Date.now() - example.messages.length * 60_000;
    messages = example.messages.map((message, index) => ({
      ...message,
      timestamp: base + index * 60_000,
    }));
    render();
  });
});

document.querySelector("#clear")!.addEventListener("click", () => {
  messages = [];
  render();
});

render();
