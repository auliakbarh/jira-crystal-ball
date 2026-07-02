// Minimal Google Gemini REST client for Fortune (ticket drafting/refining).
// Stateless per call: every request carries its full `contents` — no module-level
// conversation state — so concurrent users never share context.
import { env, hasGeminiKey } from "./env.js";

const API_HOST = "https://generativelanguage.googleapis.com";
const API_VERSION = "v1beta";

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A prompt part: text, or inline binary (image/PDF) as base64.
export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
// A conversation turn (role + parts) for stateless multi-turn refine.
export interface GeminiTurn {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  estCostUSD: number;
  estCostIDR: number;
}

// Per-1M-token USD prices (input/output). Approximate; override map as needed.
// Unknown models fall back to the flash tier. Keep in sync with Google pricing.
const PRICE_USD_PER_M: Record<string, { in: number; out: number }> = {
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  "gemini-2.0-flash": { in: 0.1, out: 0.4 },
};
const FALLBACK_PRICE = { in: 0.3, out: 2.5 };
const FX_IDR = Number(process.env.GEMINI_FX_IDR ?? "16000");

function estCost(model: string, promptTokens: number, outputTokens: number) {
  const p = PRICE_USD_PER_M[model] ?? FALLBACK_PRICE;
  const usd = (promptTokens / 1e6) * p.in + (outputTokens / 1e6) * p.out;
  return { estCostUSD: usd, estCostIDR: usd * FX_IDR };
}

function requireKey(): string {
  if (!hasGeminiKey()) throw new Error("Gemini is not configured (set GEMINI_API_KEY on the server).");
  return env.gemini.apiKey;
}

interface RawResult {
  text: string;
  usage: GeminiUsage;
}

export const DEFAULT_TEMPERATURE = Number(process.env.GEMINI_TEMPERATURE ?? "0.2");

// Single HTTP wrapper. `turns` is the full conversation; `extraConfig` merges into
// generationConfig (e.g. responseMimeType for JSON). Retries transient 429/5xx.
async function generate(turns: GeminiTurn[], model: string, extraConfig: Record<string, unknown> = {}, temperature?: number): Promise<RawResult> {
  const key = requireKey();
  const url = `${API_HOST}/${API_VERSION}/models/${model}:generateContent`;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: turns,
        generationConfig: { temperature: temperature ?? DEFAULT_TEMPERATURE, topP: 0.95, maxOutputTokens: 8192, ...extraConfig },
      }),
    });
    const body: any = await res.json().catch(() => ({}));

    if (!res.ok) {
      lastError = new Error(`Gemini ${res.status}: ${body?.error?.message || res.statusText}`);
      if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw lastError;
    }

    const cand = body.candidates?.[0];
    const text: string = (cand?.content?.parts ?? []).map((p: any) => p.text).filter(Boolean).join("") ?? "";
    if (!text.trim()) {
      const reason = cand?.finishReason || body.promptFeedback?.blockReason || "empty response";
      throw new Error(`Gemini returned no text (${reason})`);
    }
    const um = body.usageMetadata ?? {};
    const promptTokens = Number(um.promptTokenCount ?? 0);
    const outputTokens = Number(um.candidatesTokenCount ?? 0);
    const totalTokens = Number(um.totalTokenCount ?? promptTokens + outputTokens);
    return {
      text: text.trim(),
      usage: { promptTokens, outputTokens, totalTokens, model, ...estCost(model, promptTokens, outputTokens) },
    };
  }
  throw lastError ?? new Error("Gemini request failed");
}

// Generate JSON: forces responseMimeType and strips an accidental code fence.
export async function generateJSON<T>(turns: GeminiTurn[], model: string, temperature?: number): Promise<{ data: T; usage: GeminiUsage }> {
  const { text, usage } = await generate(turns, model, { responseMimeType: "application/json" }, temperature);
  const cleaned = text.replace(/^```(?:json)?\s*\n/, "").replace(/\n```\s*$/, "").trim();
  try {
    return { data: JSON.parse(cleaned) as T, usage };
  } catch {
    throw new Error("Gemini did not return valid JSON");
  }
}

/** List curated text-generation models the key can call (generateContent only). */
export async function listModels(): Promise<string[]> {
  const key = requireKey();
  const res = await fetch(`${API_HOST}/${API_VERSION}/models?key=${encodeURIComponent(key)}&pageSize=200`);
  if (!res.ok) throw new Error(`Gemini model list failed (${res.status})`);
  const data: any = await res.json();
  const names: string[] = (data.models ?? [])
    .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m: any) => String(m.name).replace(/^models\//, ""))
    // Drop non-text families (image/tts/embedding/audio/robotics/etc.).
    .filter((n: string) => /^gemini-/.test(n) && !/(image|tts|audio|embedding|robotics|computer-use|nano-banana)/.test(n));
  // Ensure the configured default is present and first.
  const def = env.gemini.defaultModel;
  const uniq = Array.from(new Set([def, ...names]));
  return uniq;
}
