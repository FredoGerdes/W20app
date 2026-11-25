# Haushalt

Web-App für zwei: Kapazitäts-Ampel, wiederkehrende Haushaltsaufgaben, synchrone Einkaufsliste mit Vorschlägen,
Gerichtsbibliothek mit KI-Nährwerten und Essensvorschlägen nach Kalender und Kapazität.
Läuft im Browser und lässt sich auf dem iPhone über „Teilen → Zum Home-Bildschirm“ wie eine App installieren.

## Lokal ausprobieren (Demo-Modus)

```bash
npm install
npm run dev
```

Ohne `.env` läuft die App im Demo-Modus: Daten liegen nur im Browser, keine Synchronisation, keine KI, kein Kalender.

## Einrichtung für euch beide

### 1. Supabase (Datenbank, Anmeldung, Sync) – kostenlos

1. Auf [supabase.com](https://supabase.com) ein Projekt anlegen (Region Frankfurt).
2. **SQL Editor** → Inhalt von `supabase/schema.sql` einfügen → Run.
3. **Edge Functions** → zwei Funktionen anlegen, jeweils den Code einfügen und deployen:
   - `ai` ← `supabase/functions/ai/index.ts`
   - `calendar` ← `supabase/functions/calendar/index.ts`
4. **Edge Functions → Secrets**: `ANTHROPIC_API_KEY` mit einem Schlüssel von [platform.claude.com](https://platform.claude.com) anlegen.
5. **Project Settings → API**: Project URL und anon/publishable Key notieren.

### 2. Veröffentlichen über GitHub Pages

1. Im GitHub-Repo: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: `VITE_SUPABASE_URL` und `VITE_SUPABASE_KEY` anlegen
   (beide Werte sind öffentlich, der Schutz liegt in den Datenbankregeln).
3. Push auf `main` baut und veröffentlicht die App unter `https://<name>.github.io/<repo>/`.

Hinweis: GitHub Pages ist bei kostenlosen Konten nur für öffentliche Repos verfügbar.

### 3. Loslegen

1. Du öffnest den Link, registrierst dich und legst den Haushalt an.
2. Unter **Mehr** steht der Einladungscode: deine Partnerin registriert sich und tritt damit bei.
3. Danach in Supabase unter **Authentication → Sign In / Providers** neue Registrierungen abschalten.
4. Optional unter **Mehr** den Kalender-Abo-Link (ICS) eintragen.

## Aufbau

- `src/` – React-App (Vite, TypeScript); `src/store.ts` kapselt Supabase bzw. den lokalen Demo-Speicher.
- `supabase/schema.sql` – Tabellen, Zugriffsregeln (Row Level Security), Einladungslogik.
- `supabase/functions/ai` – Claude-Aufrufe für Nährwerte und Essensvorschläge.
- `supabase/functions/calendar` – liest die ICS-Kalender und liefert die Termine des Tages.
