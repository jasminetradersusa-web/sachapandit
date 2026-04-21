/**
 * Ollama local inference (server-only). No secrets; base URL from env.
 */

import "server-only";

export type OllamaGenerateJson = {
  response?: string;
  images?: string[];
};

/** Thrown when Ollama isn’t listening (e.g. `ollama serve` not started). */
export class OllamaUnavailableError extends Error {
  constructor(
    message = "Ollama isn’t running or can’t be reached. Start it locally (e.g. `ollama serve`) and ensure the model is pulled.",
  ) {
    super(message);
    this.name = "OllamaUnavailableError";
  }
}

function trimBase(url: string): string {
  return url.replace(/\/$/, "");
}

function isLikelyUnreachable(e: unknown): boolean {
  if (e instanceof Error && e.name === "AbortError") return false;
  if (!(e instanceof Error)) return false;
  const cause = e.cause as { code?: string } | undefined;
  const code = cause?.code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN") return true;
  const m = e.message.toLowerCase();
  return m.includes("econnrefused") || m.includes("fetch failed") || m.includes("network error");
}

export async function ollamaGenerateText(
  baseUrl: string,
  model: string,
  prompt: string,
  options?: { timeoutMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  let res: Response;
  try {
    res = await fetch(`${trimBase(baseUrl)}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (isLikelyUnreachable(e)) throw new OllamaUnavailableError();
    if (e instanceof Error && e.name === "AbortError") {
      throw new OllamaUnavailableError(
        "Ollama didn’t respond in time. Check that it’s running and the model is available.",
      );
    }
    throw e;
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama HTTP ${res.status}: ${t.slice(0, 240)}`);
  }

  let data: OllamaGenerateJson;
  try {
    data = (await res.json()) as OllamaGenerateJson;
  } catch {
    throw new Error("Ollama returned invalid JSON");
  }

  const text = typeof data.response === "string" ? data.response.trim() : "";
  if (!text) {
    throw new Error("Ollama returned empty text");
  }
  return text;
}

/**
 * Image models (Stable Diffusion, Flux, etc.) return base64 in `images[]` from `/api/generate`.
 */
export async function ollamaGenerateImageBase64(
  baseUrl: string,
  model: string,
  prompt: string,
  options?: { timeoutMs?: number },
): Promise<{ base64: string; mime: string }> {
  const timeoutMs = options?.timeoutMs ?? 180_000;
  let res: Response;
  try {
    res = await fetch(`${trimBase(baseUrl)}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (isLikelyUnreachable(e)) throw new OllamaUnavailableError();
    if (e instanceof Error && e.name === "AbortError") {
      throw new OllamaUnavailableError(
        "Image generation timed out. Check that Ollama is running and the image model is pulled.",
      );
    }
    throw e;
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama image HTTP ${res.status}: ${t.slice(0, 240)}`);
  }

  let data: OllamaGenerateJson;
  try {
    data = (await res.json()) as OllamaGenerateJson;
  } catch {
    throw new Error("Ollama returned invalid JSON");
  }

  const raw = data.images?.[0];
  if (typeof raw !== "string" || raw.length < 32) {
    throw new Error(
      "Ollama returned no image — use an image-capable model (e.g. stablediffusion, flux) and set OLLAMA_IMAGE_MODEL.",
    );
  }

  const mime = raw.startsWith("/9j/") ? "image/jpeg" : "image/png";
  return { base64: raw, mime };
}
