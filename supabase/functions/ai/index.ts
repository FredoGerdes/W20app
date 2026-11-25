// Edge Function "ai": Nährwerte für Gerichte schätzen und Essensvorschläge machen.
// Benötigt das Secret ANTHROPIC_API_KEY (Supabase-Dashboard → Edge Functions → Secrets).
import Anthropic from "npm:@anthropic-ai/sdk";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { z } from "npm:zod";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const DishSchema = z.object({
  ingredients: z.array(z.string()).describe("Zutaten mit Menge für die angegebene Portionszahl, eine pro Eintrag, z. B. '200 g Spaghetti'"),
  minutes: z.number().describe("Gesamte Zubereitungszeit in Minuten"),
  effort: z.number().describe("Aufwand: 1 = leicht, 2 = mittel, 3 = aufwendig"),
  kcal: z.number().describe("Kilokalorien pro Portion"),
  protein: z.number().describe("Eiweiß in Gramm pro Portion"),
  carbs: z.number().describe("Kohlenhydrate in Gramm pro Portion"),
  fat: z.number().describe("Fett in Gramm pro Portion"),
});

const SuggestSchema = z.object({
  suggestions: z.array(z.object({
    name: z.string().describe("Name des Gerichts; bei bekannten Gerichten exakt wie in der Bibliothek"),
    known: z.boolean().describe("true, wenn das Gericht aus der Bibliothek stammt"),
    reason: z.string().describe("Ein kurzer Satz auf Deutsch, warum das heute passt"),
  })),
});

const client = new Anthropic();

async function ask<T>(schema: z.ZodType<T>, system: string, user: string): Promise<T> {
  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: "low", format: zodOutputFormat(schema) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Keine verwertbare Antwort vom Modell");
  return res.parsed_output;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Nur Mitglieder eines Haushalts dürfen die KI nutzen (sonst könnte jede:r Registrierte Kosten verursachen).
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: members } = await supabase.from("members").select("id").limit(1);
    if (!members?.length) return json({ error: "Kein Zugriff" }, 403);

    const body = await req.json();

    if (body.action === "dish") {
      const out = await ask(
        DishSchema,
        "Du bist Ernährungsberater und Koch. Schätze für ein Gericht realistische Nährwerte pro Portion. " +
          "Wenn Zutaten angegeben sind, übernimm sie unverändert und rechne damit; wenn keine angegeben sind, " +
          "schlage eine übliche Zutatenliste für die angegebene Portionszahl vor. Antworte auf Deutsch.",
        `Gericht: ${String(body.name).slice(0, 200)}\nPortionen: ${Number(body.servings) || 2}\nZutaten:\n${String(body.ingredients || "(keine angegeben)").slice(0, 4000)}`,
      );
      return json(out);
    }

    if (body.action === "suggest") {
      const out = await ask(
        SuggestSchema,
        "Du hilfst einem Paar bei der Frage, was es heute Abend kocht. Du bekommst die Gerichtsbibliothek, " +
          "die heutige Kapazität beider (1 = Akku leer, 5 = volle Energie; null = nicht eingetragen) und ihre Kalenderauslastung. " +
          "Gib genau drei Vorschläge, der passendste zuerst. Bevorzuge Gerichte aus der Bibliothek, die länger nicht gekocht wurden. " +
          "Bei wenig Kapazität oder vollem Kalender nur schnelle, leichte Gerichte. Höchstens ein Vorschlag darf ein neues Gericht sein, " +
          "das zum Geschmack der Bibliothek passt; ist die Bibliothek leer, dürfen alle neu sein. Antworte auf Deutsch.",
        JSON.stringify(body.context).slice(0, 60000),
      );
      return json(out);
    }

    return json({ error: "Unbekannte Aktion" }, 400);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Zu viele Anfragen, bitte kurz warten" }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "ANTHROPIC_API_KEY fehlt oder ist ungültig" }, 500);
    if (e instanceof Anthropic.APIError) return json({ error: `KI-Fehler: ${e.message}` }, 502);
    return json({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }, 500);
  }
});
