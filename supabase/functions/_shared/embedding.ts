// Shared embedding provider (Cloudflare Workers AI or local LM Studio).

import {
  EMBEDDING_PROVIDER, EMBEDDING_MODEL,
  CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, LLM_ENDPOINT,
} from "./env.ts";

export async function generateEmbedding(text: string): Promise<number[]> {
  return EMBEDDING_PROVIDER === "cloudflare"
    ? generateEmbeddingCloudflare(text)
    : generateEmbeddingLMStudio(text);
}

async function generateEmbeddingCloudflare(text: string): Promise<number[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/google/embeddinggemma-300m`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
      },
      body: JSON.stringify({ text: [text] }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error(`Cloudflare embedding error: ${err}`);
    throw new Error("Cloudflare embedding failed");
  }
  const data = await res.json();
  return data.result?.data?.[0] || [];
}

async function generateEmbeddingLMStudio(text: string): Promise<number[]> {
  const res = await fetch(`${LLM_ENDPOINT}/v1/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}
