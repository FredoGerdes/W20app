// Edge Function "calendar": liest die hinterlegten Kalender-Abos (ICS-Links) der Haushaltsmitglieder
// und gibt die Termine im angefragten Zeitraum zurück.
import ICAL from "npm:ical.js@2.1.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Ev = { title: string; start: string; end: string; allDay: boolean };

export function eventsBetween(ics: string, from: Date, to: Date): Ev[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    const tzid = tz.getFirstPropertyValue("tzid");
    if (tzid && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(tzid, new ICAL.Timezone({ component: tz, tzid }));
    }
  }
  const all = root.getAllSubcomponents("vevent").map((c: unknown) => new ICAL.Event(c));
  const exceptions = all.filter((e: any) => e.isRecurrenceException());
  const out: Ev[] = [];
  const push = (title: string, s: any, e: any) => {
    const start = s.toJSDate(), end = e.toJSDate();
    if (end > from && start < to) {
      out.push({ title: title || "Termin", start: start.toISOString(), end: end.toISOString(), allDay: !!s.isDate });
    }
  };
  for (const ev of all) {
    if (ev.isRecurrenceException()) continue;
    if (ev.component.getFirstPropertyValue("status") === "CANCELLED") continue;
    if (!ev.isRecurring()) {
      push(ev.summary, ev.startDate, ev.endDate);
      continue;
    }
    for (const ex of exceptions) if (ex.uid === ev.uid) ev.relateException(ex);
    const it = ev.iterator();
    for (let i = 0, next; i < 5000 && (next = it.next()); i++) {
      if (next.toJSDate() >= to) break;
      const d = ev.getOccurrenceDetails(next);
      if (d.item.component.getFirstPropertyValue("status") === "CANCELLED") continue;
      push(d.item.summary, d.startDate, d.endDate);
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim().replace(/^webcal:/i, "https:"));
    if (u.protocol !== "https:") return null;
    const h = u.hostname;
    // keine internen Adressen abrufen
    if (h === "localhost" || h.endsWith(".internal") || h.endsWith(".local") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { from, to } = await req.json();
    const f = new Date(from), t = new Date(to);
    if (isNaN(+f) || isNaN(+t)) return json({ error: "from/to fehlen" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: members, error } = await supabase.from("members").select("id, ics_url");
    if (error) return json({ error: error.message }, 401);

    const result: Record<string, { events: Ev[]; error?: string }> = {};
    await Promise.all((members ?? []).filter((m) => m.ics_url).map(async (m) => {
      const url = safeUrl(m.ics_url);
      if (!url) {
        result[m.id] = { events: [], error: "Ungültiger Kalender-Link" };
        return;
      }
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: "error" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        result[m.id] = { events: eventsBetween(await res.text(), f, t) };
      } catch (e) {
        result[m.id] = { events: [], error: `Kalender nicht lesbar (${e instanceof Error ? e.message : e})` };
      }
    }));
    return json(result);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }, 500);
  }
});
