// Shared configuration for every edge function.
// Read once at module load: Deno injects these as env vars at deploy time.

export const LLM_PROVIDER = Deno.env.get("LLM_PROVIDER") || "lmstudio"; // "lmstudio" | "gemini"
export const LLM_ENDPOINT = Deno.env.get("LLM_ENDPOINT") || "http://localhost:1234";
export const LLM_MODEL = Deno.env.get("LLM_MODEL") || "lm-studio";
export const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
export const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";

export const EMBEDDING_PROVIDER = Deno.env.get("EMBEDDING_PROVIDER") || "cloudflare"; // "lmstudio" | "cloudflare"
export const EMBEDDING_MODEL = Deno.env.get("EMBEDDING_MODEL") || "@cf/google/embeddinggemma-300m";
export const CLOUDFLARE_ACCOUNT_ID = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
export const CLOUDFLARE_API_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";

export const SUPABASE_STORAGE_URL = Deno.env.get("STORAGE_URL") || "";

export const LANG_NAMES: Record<string, string> = {
  it: "italiano", es: "spagnolo", en: "inglese", fr: "francese",
  de: "tedesco", ar: "arabo", pt: "portoghese", ru: "russo",
  zh: "cinese", ja: "giapponese", ko: "coreano", bn: "bengalese", si: "singalese",
};
