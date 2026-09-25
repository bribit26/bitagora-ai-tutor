# BitAgorà AI Tutor — CLAUDE.md

@AGENTS.md

App di tutoraggio AI per i commerciali BitAgorà: registra le trattative
commerciali (da smartphone in visita cliente, o da desktop su call Teams),
le confronta con `src/lib/manuale.md` (le direttive di vendita BitAgorà) e
restituisce un report con punteggio, punti di forza e aree di miglioramento.

Nessuna autenticazione: tutte le analisi sono in un unico database condiviso
tra i commerciali (limitazione nota, vedi `PROGRESS.md`).

**Questo file resta sotto le 200 righe di proposito** — è il riferimento
rapido stabile (identità, come lavorarci, stack). Per la mappa completa
file-per-file dell'architettura vedi **`OVERVIEW.md`**. Per lo stato attuale
e i prossimi passi vedi **`PROGRESS.md`**.

## Stack

- **Frontend/Backend**: Next.js 16 (App Router) + React 19, deployato su
  Vercel: https://bitagora-ai-tutor.vercel.app/
- **Storage/DB**: Supabase (bucket `recordings` per l'audio, tabella
  `analyses` per i risultati)
- **AI**: Google Gemini 3.8 Flash (`gemini-3.8-flash`) via `@google/genai`, tramite Google GenAI
  File API per gestire audio anche lunghi (fino a 90 minuti)
- **Registrazione audio**: `MediaRecorder` nativo del browser, webm/opus a
  24kbps (~0.18 MB/min)

## Come lavorarci

```bash
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

Richiede `.env.local` con `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (non versionato, chiedere a Daniele).

Le migrazioni SQL (`supabase_setup.sql`, `supabase_update.sql`,
`supabase_update_v2.sql`) vanno applicate manualmente da SQL Editor su
Supabase — non c'è un sistema di migrazioni automatico.

## Flusso principale

Registra → upload diretto su Supabase Storage → `/api/analyze` scarica
l'audio, lo carica su Google GenAI File API, un'unica chiamata Gemini
restituisce punteggio + feedback + trascrizione → tutto salvato in
`analyses` → mostrato nella card risultato e, in seguito, nell'Archivio.
Dettaglio completo in `OVERVIEW.md`.

## Convenzioni

- Componenti in `src/components/`, uno per responsabilità, ciascuno con il
  proprio `*.module.css` colocato (CSS Modules, non un design system
  condiviso).
- Logica di rete (Supabase, fetch a `/api/analyze`) centralizzata in
  `src/app/page.tsx`; i componenti restano presentazionali.
- Nessun test runner configurato: verifica tramite `npm run build` +
  `npm run lint` + test manuale in browser.
