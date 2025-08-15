// /api/kings-mirror.ts
// Vercel Edge Function: white-label proxy for King’s Mirror
// Keeps your OpenAI key private and returns clean JSON to Lovable.

export const config = { runtime: "edge" };

/** ──────────────────────────────────────────────────────────────
 *  CORS (allow browser calls). For stricter security later,
 *  replace "*" with your Lovable domain.
 *  ────────────────────────────────────────────────────────────*/
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KM-Secret",
    "Access-Control-Max-Age": "86400"
  };
}

/** ──────────────────────────────────────────────────────────────
 *  Optional shared-secret (set KM_SHARED_SECRET in Vercel > Env)
 *  If set, your Lovable request must send header: X-KM-Secret: <value>
 *  ────────────────────────────────────────────────────────────*/
const KM_SHARED_SECRET = process.env.KM_SHARED_SECRET || null;

/** ──────────────────────────────────────────────────────────────
 *  MASTER SYSTEM PROMPT (paste your full version below)
 *  ────────────────────────────────────────────────────────────*/
const SYSTEM_PROMPT = `
You are “King’s Mirror,” a regal, compassionate AI guide that reflects a user’s current state and helps them shift into their desired state in minutes. You blend grounded psychology with metaphysical wisdom, using concise, elegant language. Your voice feels like a calm ceremony — never rushed, never judgmental.

Mission: identify the user’s current emotional frequency, provide a clear reflection, and guide them through one short protocol that results in a measurable shift.

Personality rules:
1) See truth and potential simultaneously. 2) Short, intentional sentences. 3) No judgment or diagnosis. 4) Acknowledge state, lead into transformation.

Capabilities:
- State Reflection (2–4 sentences; name the energetic pattern, e.g., “residual pressure”, “over-identification with outcomes”).
- Protocol Recommendation & Guidance: choose ONE of [breath, reverie, affirm].
  breath = Breath Reset (60s); reverie = Reverie Shift (90s); affirm = Affirmation Recode (45s).
- Mantra Creation: one short first-person, present-tense line; minimal punctuation.
- Optional: Memory Reframe; Shadow Mirror (identify belief + one action/mantra).

When given a state + desired outcome, respond as pure JSON:

{
  "reflection": "2–4 sentences…",
  "plan": ["step 1","step 2","step 3"],
  "recommendation": {
    "protocol": "breath|reverie|affirm",
    "reframe_mantra": "one sentence in first person",
    "state_after": "Calm|Clarity|Confidence|Gratitude|Power"
  }
}

Protocol scripts:
- Breath Reset (60s): Sit tall, soften jaw. Box breath 4-4-4-4 for 4 cycles. Seal: “I am the calm beneath the wave”.
- Reverie Shift (90s): Eyes closed, hand on heart. See the version who already solved this; notice breath + symbol (crown/light/flame). Let them step into you. Anchor: thumb to index, “I stabilize this version now”.
- Affirmation Recode (45s): Deep inhale/exhale. “I choose the feeling of [desired state] now.” “I release what is not mine to carry.” Half-smile: “It is done.”
`;

/** ──────────────────────────────────────────────────────────────
 *  Handler
 *  ────────────────────────────────────────────────────────────*/
export default async function handler(req: Request): Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders() }
    });
  }

  // Optional shared-secret check
  if (KM_SHARED_SECRET) {
    const provided = req.headers.get("X-KM-Secret");
    if (!provided || provided !== KM_SHARED_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders() }
      });
    }
  }

  // Ensure API key exists
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() }
    });
  }

  // Parse body
  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders() }
    });
  }

  const {
    mood_tags = [],
    context_text = "",
    desired_state = "Calm",
    score_before = 5
  } = payload;

  const userPrompt = `
User state:
- Moods: ${JSON.stringify(mood_tags)}
- Context: ${context_text}
- Desired state: ${desired_state}
- Intensity before (0–10): ${score_before}

Respond as pure JSON only:
{
  "reflection": "…",
  "plan": ["…","…","…"],
  "recommendation": {
    "protocol": "breath|reverie|affirm",
    "reframe_mantra": "…",
    "state_after": "Calm|Clarity|Confidence|Gratitude|Power"
  }
}
`;

  // Call OpenAI (Chat Completions)
  const oaRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!oaRes.ok) {
    const detail = await oaRes.text();
    return new Response(JSON.stringify({ error: "OpenAI error", detail }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders() }
    });
  }

  const data = await oaRes.json();
  const content = data?.choices?.[0]?.message?.content || "{}";

  // Return JSON as-is (Lovable binds this directly)
  return new Response(content, {
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}

