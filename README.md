# Race Calendar

En responsiv, norsk felleskalender for løp og fellestreninger. Alle som åpner appen kan administrere løpere, arrangementer og deltakerstatus.

## Lokal oppstart

1. Kjør SQL-en i [`supabase/schema.sql`](supabase/schema.sql) i Supabase SQL Editor. Hvis du allerede har kjørt samme skjema, kan dette steget hoppes over.
2. Kopier `.env.example` til `.env.local` og sett prosjektets URL og anon key:

   ```text
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Installer og start:

   ```bash
   npm install
   npm run dev
   ```

Uten miljøvariablene starter appen med eksempeldata, slik at grensesnittet kan vurderes lokalt.

## Forslag til andre løp

Under kalenderen vises en seksjon, **«Forslag til andre løp»**, som henter aktuelle motbakke-/fjell-/trailløp fra eksterne kilder og filtrerer bort løp som allerede finnes i den manuelt vedlikeholdte kalenderen. Disse forslagene lagres aldri i Supabase – de hentes kun i minnet ved sidelasting. Bruker kan trykke **«Legg til»** for å åpne det vanlige arrangement-skjemaet, forhåndsutfylt med data fra forslaget.

Kilden er forberedt for **EQ Timing**, men EQ Timing publiserer ikke noe dokumentert, offentlig API for å liste opp løp (siden er bygget som en påmeldings-/nettbutikkplattform for enkeltarrangementer, uten et "hent alle løp"-endepunkt eller CORS-støtte for nettleserkall). Adapteren i `src/raceSources/eqTiming.js` er derfor forberedt til å hente fra en valgfri, konfigurerbar feed:

```text
VITE_EQTIMING_FEED_URL=https://example.com/eqtiming-events.json
```

Er variabelen ikke satt, bidrar kilden ganske enkelt med null forslag – resten av appen fungerer som normalt. Samme mønster kan brukes til å koble på flere kilder senere (for eksempel Kondis' terminliste) ved å legge til en ny fil i `src/raceSources/` og registrere den i `src/raceSources/index.js`.

## GitHub Pages

Workflowen i `.github/workflows/deploy.yml` publiserer ved push til `main`. I GitHub-repositoriet:

1. Velg **Settings → Pages → Build and deployment → GitHub Actions**.
2. Legg til `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` som Actions secrets.

> Anon key er laget for klientbruk, men RLS-reglene i skjemaet åpner bevisst for felles, offentlig redigering. Ikke lagre sensitiv informasjon i kalenderen.
