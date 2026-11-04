// Gemini API operates only when GEMINI_API_KEY is configured as a Cloudflare secret.
// A missing key or quota error must never cause a paid plan to be enabled.
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

function asParts(text) {
  return [{ text: String(text || "").slice(0, 16000) }];
}

export async function generateWithGemini(env, messages, { json = false, maxOutputTokens = 1200 } = {}) {
  if (!env.GEMINI_API_KEY) return null;
  const model = String(env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  if (!/^gemini-[a-z0-9.-]+$/i.test(model)) {
    throw new Error("Gemini model name rejected");
  }
  const instruction = messages.filter(m => m.role === "system")
    .map(m => String(m.content || "")).join("\n").slice(0, 10000);
  const contents = messages.filter(m => m.role !== "system")
    .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: asParts(m.content) }));
  if (!contents.length) throw new Error("Gemini message list is empty");
  const body = {
    ...(instruction ? { systemInstruction: { parts: asParts(instruction) } } : {}),
    contents,
    generationConfig: {
      temperature: json ? 0 : 0.55,
      maxOutputTokens: Math.min(2048, Math.max(128, maxOutputTokens)),
      ...(json ? { responseMimeType: "application/json" } : {})
    }
  };
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent";
  // Never include secrets or user content in thrown errors/log messages.
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("Gemini unavailable (HTTP " + response.status + ")");
  const data = await response.json();
  const result = (data.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("\n").trim();
  if (!result) throw new Error("Gemini returned empty content");
  return result;
}

[executed on device: MSI (f4bae329-0864-4381-bcba-d34ec4443a6f)]