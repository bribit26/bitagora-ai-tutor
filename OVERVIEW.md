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

## Backend (`src/app/api/analyze/route.ts`)

Unico endpoint API. Riceve `{filePath, contextNotes}`:

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
6. Salva tutto in Supabase (`analyses`: `file_path`, `feedback`, `score`,
   `context_notes`, `transcript`) e lo restituisce al frontend.

## Database (Supabase)

Tabella `public.analyses`: `id`, `created_at`, `file_path`, `feedback`,
`score`, `context_notes` (nullable), `transcript` (nullable). RLS aperta al
ruolo `anon` per insert/select/delete (nessuna autenticazione utente, vedi
`PROGRESS.md`). Bucket storage `recordings`, privato: accesso solo tramite
URL firmati generati al volo (upload/download/lettura), mai reso pubblico.

Migrazioni, da applicare manualmente in ordine su SQL Editor:
`supabase_setup.sql` → `supabase_update.sql` → `supabase_update_v2.sql`.

## Come nasce un'analisi, passo per passo

1. Il commerciale apre l'app, scrive eventuali note di contesto, preme
   "Nuova Trattativa" → `useRecorder.startRecording()`.
2. Durante la call può riaprire le note tramite il bottone "Note"
   (`NotesOverlay`) senza interrompere la registrazione.
3. "Termina" → `useRecorder` chiude il `MediaRecorder`, produce il blob, e
   chiama `onRecordingComplete` (= `handleUpload` in `page.tsx`).
4. `handleUpload` carica il blob su Supabase Storage, poi chiama
   `POST /api/analyze` con `filePath` + le note correnti.
5. Il risultato (`score`, `feedback`, `transcript`) torna al frontend,
   `page.tsx` lo unisce a `file_path` e alle note per costruire l'oggetto
   `AnalysisItem` mostrato in `AnalysisCard`.
6. In Archivio, `loadArchive()` fa una `select *` su `analyses` e passa i
   risultati (già nella forma `AnalysisItem`, colonne comprese) ad
   `ArchiveView`.
