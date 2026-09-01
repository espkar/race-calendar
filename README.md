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

## GitHub Pages

Workflowen i `.github/workflows/deploy.yml` publiserer ved push til `main`. I GitHub-repositoriet:

1. Velg **Settings → Pages → Build and deployment → GitHub Actions**.
2. Legg til `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` som Actions secrets.

> Anon key er laget for klientbruk, men RLS-reglene i skjemaet åpner bevisst for felles, offentlig redigering. Ikke lagre sensitiv informasjon i kalenderen.
