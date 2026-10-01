// Shared access guards for AI endpoints (chat, live voice).
// Estratto da chat/index.ts (passi 1-3 + incremento contatore): la logica deve
// restare byte-identica — auth → has_ai → rate limit giornaliero a mezzanotte.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEYS") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  return createClient(supabaseUrl, supabaseKey);
}

export interface GuardOk {
  ok: true;
  user: { id: string };
  /** Contatore azzerato a mezzanotte se l'ultima richiesta è di un giorno diverso. */
  requestCount: number;
  dailyLimit: number;
  remaining: number;
  /** Istante della verifica: passarlo a consumeChatRequest per comportamento identico a chat. */
  now: Date;
}

export interface GuardError {
  ok: false;
  status: number;
  body: Record<string, unknown>;
}

export type GuardResult = GuardOk | GuardError;

/**
 * Autentica l'utente e verifica has_ai + rate limit giornaliero.
 * Restituisce l'errore HTTP pronto da inviare (401/403/429) oppure i dati
 * del profilo con il contatore già normalizzato a mezzanotte.
 */
export async function guardChatAccess(
  supabase: ReturnType<typeof createAdminClient>,
  authHeader: string | null,
): Promise<GuardResult> {
  // ── 1. Authenticate user ──
  if (!authHeader) return { ok: false, status: 401, body: { error: "Unauthorized" } };

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return { ok: false, status: 401, body: { error: "Unauthorized" } };

  // ── 2. Retrieve profile ──
  const { data: profile } = await supabase
    .from("profiles")
    .select("has_ai, request_count, last_request_at, chat_daily_limit")
    .eq("id", user.id)
    .single();

  if (!profile?.has_ai) {
    return {
      ok: false,
      status: 403,
      body: { error: "Chat AI non attiva per il tuo account", code: "AI_NOT_ENABLED" },
    };
  }

  const dailyLimit = profile.chat_daily_limit ?? 20;

  // ── 3. Rate limit (resets at midnight) ──
  const now = new Date();
  const lastRequest = profile.last_request_at ? new Date(profile.last_request_at) : null;
  let requestCount = profile.request_count || 0;

  if (lastRequest && lastRequest.toDateString() !== now.toDateString()) {
    requestCount = 0;
  }

  if (requestCount >= dailyLimit) {
    return {
      ok: false,
      status: 429,
      body: {
        error: `Hai raggiunto il limite di ${dailyLimit} richieste giornaliere. Torna domani!`,
        code: "RATE_LIMIT",
        remaining_requests: 0,
      },
    };
  }

  return {
    ok: true,
    user: { id: user.id },
    requestCount,
    dailyLimit,
    remaining: dailyLimit - requestCount,
    now,
  };
}

/** Incrementa il contatore giornaliero (step 7 di chat): identico all'originale. */
export async function consumeChatRequest(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  requestCount: number,
  now: Date,
): Promise<void> {
  await supabase
    .from("profiles")
    .update({
      request_count: requestCount + 1,
      last_request_at: now.toISOString(),
    })
    .eq("id", userId);
}
