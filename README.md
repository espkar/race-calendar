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

Under kalenderen vises en seksjon, **«Forslag til andre løp»**, som viser aktuelle motbakke-/fjell-/trail-/ultraløp hentet automatisk fra **EQ Timing**. Forslagene lagres aldri i Supabase eller noen database – de hentes kun i minnet ved sidelasting, og sammenlignes mot den manuelt vedlikeholdte kalenderen slik at løp som allerede finnes der ikke vises på nytt (dette skjer i nettleseren, ikke bare i den daglige jobben, slik at nylig lagt-til løp forsvinner fra forslagene umiddelbart). Bruker kan trykke **«Legg til»** for å åpne det vanlige arrangement-skjemaet, forhåndsutfylt med data fra forslaget – løpet blir først en del av kalenderen når brukeren selv lagrer skjemaet.

**EQ Timing har faktisk et offentlig, dokumentert API** (`GET https://api.eqtiming.com/api/v2/Events`, Swagger på `https://api.eqtiming.com/docs`), og det krever ingen API-nøkkel. Begrensningen er at endepunktet **ikke støtter CORS** – et `fetch()`-kall direkte fra nettleseren/GitHub Pages blir derfor blokkert av nettleseren selv om selve forespørselen lykkes på serversiden.

Løsningen er en **planlagt GitHub Actions-jobb** som kjører serverside (uten CORS-begrensning), én gang i døgnet (`.github/workflows/update-eqtiming-events.yml`, kan også kjøres manuelt):

```
EQ Timing API → scripts/update-eqtiming-events.js → normaliser/filtrer/dedupliser → public/eqtiming-events.json → commit hvis endret
```

Scriptet henter norske arrangementer fra i dag til nyttår, filtrerer bort ugyldige/upubliserte/duplikate rader og løp som tydelig er sykkelritt (samme generiske kategorier brukes av EQ Timing for både sykkel- og terrengløp), beholder kun relevante motbakke-/fjell-/trail-/ultra-/trappeløp, og skriver resultatet til `public/eqtiming-events.json`. Denne filen er statisk og same-origin på GitHub Pages, så frontend (`src/raceSources/eqTiming.js`) kan hente den med et vanlig `fetch()` uten CORS-problemer. Jobben committer kun filen når innholdet faktisk har endret seg, og overskriver aldri en gyldig snapshot hvis EQ Timing er nede – i så fall feiler jobben tydelig og forrige snapshot blir stående.

Samme arkitektur kan utvides med flere kilder (for eksempel Kondis' terminliste) ved å legge til en ny fil i `src/raceSources/` og registrere den i `src/raceSources/index.js`.

## GitHub Pages

Workflowen i `.github/workflows/deploy.yml` publiserer ved push til `main`. I GitHub-repositoriet:

1. Velg **Settings → Pages → Build and deployment → GitHub Actions**.
2. Legg til `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` som Actions secrets.

> Anon key er laget for klientbruk, men RLS-reglene i skjemaet åpner bevisst for felles, offentlig redigering. Ikke lagre sensitiv informasjon i kalenderen.
