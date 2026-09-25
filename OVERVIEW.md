# OVERVIEW — BitAgorà AI Tutor

Mappa file-per-file dell'architettura. Per il quick-reference vedi
`CLAUDE.md`; per lo stato attuale vedi `PROGRESS.md`.

## Frontend (`src/app/page.tsx` e `src/components/`)

`page.tsx` è l'orchestratore: tiene lo stato di alto livello (note di
contesto, risultato analisi corrente, vista archivio) e le uniche chiamate
di rete dell'app (upload Supabase, fetch `/api/analyze`, query/delete
Supabase per l'archivio). Compone questi pezzi:

- **`src/hooks/useRecorder.ts`**: incapsula `MediaRecorder` (avvio, pausa,
  stop, timer). Espone `{isRecording, isPaused, recordingTime,
  startRecording, togglePause, stopRecording}` e la funzione `formatTime`.
  Riceve un callback `onRecordingComplete(blob)` chiamato quando la
  registrazione termina — `page.tsx` lo usa per avviare upload+analisi.
- **`src/components/NotesInput.tsx`**: textarea controllata per le note di
  contesto, riusata sia nella schermata iniziale (prima della registrazione)
  sia dentro `NotesOverlay` (durante la registrazione).
- **`src/components/NotesOverlay.tsx`**: overlay a schermo intero richiamato
  dal bottone "Note" durante la registrazione, per annotare senza
  interrompere la call. Wrappa `NotesInput`.
- **`src/components/RecordingView.tsx`**: la vista "registrazione in corso"
  (timer, onde, controlli Termina/Pausa/Note/Archivio). Il bottone "Note"
  apre `NotesOverlay`.
- **`src/components/AnalysisCard.tsx`**: card di un singolo risultato di
  analisi (score, feedback, note di contesto in sola lettura, player audio,
  download registrazione/trascrizione/report, elimina opzionale). Usata sia
  per il risultato appena generato sia per ogni item dell'Archivio — stessa
  UI in entrambi i casi, per questo è un componente condiviso invece di due
  separati. Il player/download audio usa `src/lib/audioUrl.ts` per ottenere
  un URL firmato Supabase al volo (il bucket `recordings` resta privato).
- **`src/components/ArchiveView.tsx`**: lista delle trattative passate,
  ciascuna renderizzata con `AnalysisCard`.
- **`src/lib/audioUrl.ts`**: `getRecordingSignedUrl(filePath)` — wrapper su
  `supabase.storage.from('recordings').createSignedUrl()`, URL valido 1 ora,
  rigenerato ogni volta che una card viene mostrata (non salvato in DB).
- **`src/lib/supabase.ts`**: client Supabase (anon key), `null` se le env
  var non sono configurate (per non far crashare la build).

## Backend

La logica sta in `src/lib/analysisJob.ts`, usata da due endpoint:

- `POST /api/analyze` `{id}` — analizza una trattativa già in `analyses`
  (dopo la registrazione o da "Riprova ora") e restituisce la riga
  aggiornata. Accetta anche il vecchio `{filePath, contextNotes}` (PWA in
  cache) creando lei la riga.
- `POST /api/retry-pending` — chiamato ogni 10 minuti da pg_cron + pg_net
  su Supabase con header `Authorization: Bearer $CRON_SECRET`. Risponde 202
  subito e, in `after()`, marca `failed` le `pending` più vecchie di 24h e
  rianalizza **una** trattativa: `pending` entro 24h oppure `processing`
  bloccata da più di 15 minuti, scegliendo quella tentata meno di recente.

Stati della riga: `pending` → `processing` → `done`, oppure di nuovo
`pending` se fallisce (`attempts` +1, `last_error`), `failed` dopo 24h. La
presa in carico è ottimistica (update condizionato su `status` e
`processing_started_at`), così analisi manuale e job non lavorano mai in
parallelo sulla stessa riga.

Chiamata a Gemini (`generateWithRetry`): catena 3.8 Flash → 3.7 Flash → 3.6 Flash → 3.5 Flash-Lite → 2.5 Flash, un tentativo per modello, si passa al successivo su 404/429/5xx.

Passi di `analyzeRecording(filePath, contextNotes)`:

1. Scarica l'audio da Supabase Storage.
2. Lo carica sulla Google GenAI File API (polling finché lo stato non è
   `ACTIVE`, gestisce anche `FAILED`).
3. Costruisce il prompt: istruzioni + `src/lib/manuale.md` + (se
   `contextNotes` non è vuoto) una sezione che chiede a Gemini di tenerne
   conto nella valutazione — es. non penalizzare l'assenza di una fase se il
   contesto dice che è già stata svolta prima.
4. Una singola chiamata a Gemini 3.8 Flash con `responseSchema` che impone
   l'ordine `{transcript, valutabile, score, feedback}`: la trascrizione
   viene generata per prima e la valutazione poggia su di essa. Se l'audio
   non contiene una trattativa reale, `valutabile: false` e `score: null`.
   Rete di sicurezza server: sotto 40 parole trascritte il voto viene
   sempre azzerato e il feedback sostituito da "non valutabile".
5. Se il parsing JSON fallisce (risposta troncata o malformata), fallback:
   `score` resta `null` (nessun badge voto in UI) e `feedback` diventa il testo
   grezzo restituito da Gemini — che può essere JSON troncato, renderizzato
   comunque via `dangerouslySetInnerHTML` — mentre `transcript` resta
   `null`. Non è un fallback "pulito": l'analisi non va in errore HTTP, ma
   voto e feedback non sono realmente utilizzabili in quel caso.
6. Restituisce `{score, feedback, transcript}`; `processAnalysis` li salva
   nella riga con `status: 'done'`.

## Database (Supabase)

Tabella `public.analyses`: `id`, `created_at`, `file_path`, `feedback`
(nullable finché l'analisi non è `done`), `score`, `context_notes`
(nullable), `transcript` (nullable), `status` (default `done`), `attempts`,
`last_error`, `processing_started_at`. RLS aperta al ruolo `anon` per
insert/select/update/delete (nessuna autenticazione utente, vedi
`PROGRESS.md`). Bucket storage `recordings`, privato: accesso solo tramite
URL firmati generati al volo (upload/download/lettura), mai reso pubblico.

Migrazioni, da applicare manualmente in ordine su SQL Editor:
`supabase_setup.sql` → `supabase_update.sql` → `supabase_update_v2.sql` →
`supabase_update_v3.sql` (stato analisi + job pg_cron `retry-pending-analyses`;
il secret nel job va sostituito a mano, non è versionato).

## Come nasce un'analisi, passo per passo

1. Il commerciale apre l'app, scrive eventuali note di contesto, preme
   "Nuova Trattativa" → `useRecorder.startRecording()`.
2. Durante la call può riaprire le note tramite il bottone "Note"
   (`NotesOverlay`) senza interrompere la registrazione.
3. "Termina" → `useRecorder` chiude il `MediaRecorder`, produce il blob, e
   chiama `onRecordingComplete` (= `handleUpload` in `page.tsx`).
4. `handleUpload` carica il blob su Supabase Storage, crea la riga in
   `analyses` (`status: 'pending'`, note incluse), poi chiama
   `POST /api/analyze` con l'`id` della riga (`runAnalysis`).
5. La riga aggiornata torna al frontend ed è mostrata in `AnalysisCard`:
   se non è `done`, la card mostra lo stato e (per `pending`/`failed`) il
   pulsante "Riprova ora" (`retryAnalysis`). Se la richiesta stessa fallisce
   (rete), la card mostra `pending` e ci pensa il job automatico.
6. In Archivio, `loadArchive()` fa una `select *` su `analyses` e passa i
   risultati (già nella forma `AnalysisItem`, colonne comprese) ad
   `ArchiveView`.
