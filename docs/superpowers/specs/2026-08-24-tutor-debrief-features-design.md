# BitAgorà AI Tutor: funzionalità di debrief (riascolto, trascrizione, note di contesto)

**Data:** 2026-08-24
**Stato:** Approvato, in attesa di piano di implementazione

## Problema

L'app registra le trattative commerciali dei venditori BitAgorà, le analizza
con Gemini rispetto a `manuale_trattative_commerciali_bitagora.md`, e mostra
un report (punteggio + feedback). Oggi mancano tre cose che rendono difficile
fare un vero debrief post-trattativa:

1. Non si può riascoltare né scaricare la registrazione audio originale —
   solo il testo del feedback è scaricabile.
2. Non esiste una trascrizione testuale della conversazione: Gemini ascolta
   l'audio e produce solo un giudizio, non un testo integrale consultabile.
3. Non c'è modo di dare all'AI un contesto sulla trattativa (es. "è una call
   di approfondimento, la discovery è già stata fatta in un incontro
   precedente"), per cui l'analisi può penalizzare ingiustamente fasi che il
   commerciale ha semplicemente già svolto altrove.

## Obiettivo

Aggiungere, ispirandosi a Granola:

- riascolto e download della registrazione audio di ogni trattativa;
- download della trascrizione integrale della conversazione;
- un modo per il commerciale di fornire note di contesto prima e durante la
  registrazione, che l'AI usa per calibrare l'analisi finale.

Fuori scope per questo lavoro (già noto e rimandato, vedi `memory.md`):
autenticazione/multi-utente, filtri/ricerca in archivio, pacchetto di
download "debrief combinato" (audio+trascrizione+report in un unico file).

## Architettura

Nessun nuovo servizio: si estendono i componenti esistenti.

```
Browser (page.tsx + componenti)
   │  1. registra audio (MediaRecorder, invariato)
   │  2. note di contesto (nuovo: stato locale, raccolto prima/durante)
   ▼
Supabase Storage "recordings" (invariato: upload diretto del blob)
   ▼
POST /api/analyze { filePath, contextNotes }   ← nuovo campo nel body
   │  3. scarica audio da Supabase (invariato)
   │  4. upload su Google GenAI File API (invariato)
   │  5. UNA chiamata Gemini 2.5 Flash:
   │       prompt esteso con contextNotes
   │       risposta JSON estesa con campo "transcript"
   ▼
Supabase table "analyses" (nuove colonne: context_notes, transcript)
   ▼
Risposta { score, feedback, transcript } → frontend

Riascolto/download audio: frontend chiama
supabase.storage.from('recordings').createSignedUrl(file_path, 3600)
al momento della visualizzazione (card risultato o Archivio), non salvato.
```

## Modello dati

Nuovo file `supabase_update_v2.sql`, sullo stile di `supabase_update.sql`:

```sql
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS context_notes TEXT;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS transcript TEXT;
```

Entrambe nullable: le analisi già esistenti restano valide con questi campi
a `NULL`. Nessuna migrazione di dati storici (non è possibile ricostruire
una trascrizione a posteriori senza riscaricare e ri-processare l'audio, non
richiesto in questo lavoro).

## Note di contesto

**Raccolta:**
- Schermata iniziale: campo testo opzionale sopra il bottone di
  registrazione, etichetta "Contesto per l'AI Tutor" con placeholder
  d'esempio ("Es. call di approfondimento, discovery già fatta in
  precedenza...").
- Durante la registrazione: un quarto controllo "Note" nella recording view
  (accanto a Termina/Pausa/Archivio) apre un overlay a schermo intero con una
  textarea precompilata col testo già scritto. "Fatto" chiude l'overlay senza
  interrompere la registrazione (il MediaRecorder continua in background).
- Il testo è tenuto in uno stato React condiviso tra schermata iniziale e
  overlay (stesso valore, letto/scritto da entrambi i punti).

**Uso:**
- Alla pressione di "Termina", il testo note accumulato fino a quel momento
  viene incluso nel body della POST a `/api/analyze` come `contextNotes`.
- In `route.ts`, se `contextNotes` è non vuoto, il prompt Gemini include una
  sezione aggiuntiva: *"Contesto fornito dal commerciale prima/durante la
  chiamata: {contextNotes}. Tienine conto nella valutazione — ad esempio non
  penalizzare l'assenza di una fase se il contesto indica che è già stata
  svolta in un incontro precedente."*
- Se `contextNotes` è vuoto, il comportamento del prompt resta identico a
  oggi (nessuna sezione contesto aggiunta).
- Salvato in `analyses.context_notes`.

**Visualizzazione:**
- Nella card risultato appena generato e in ogni card dell'Archivio, se
  `context_notes` non è vuoto/null, viene mostrato in sola lettura (non
  editabile) sopra o accanto al feedback, per rendere chiaro perché l'AI ha
  valutato in un certo modo.

## Trascrizione

- Il prompt esistente in `route.ts` (quello che oggi chiede `{score,
  feedback}`) viene esteso per chiedere anche un campo `transcript`: la
  trascrizione integrale della conversazione, con etichette `Cliente:` /
  `Commerciale:` dove il parlante è distinguibile dall'audio.
- Rimane un'unica chiamata a Gemini (nessuna chiamata di trascrizione
  separata): non aumenta né il numero di chiamate API né il tempo di
  elaborazione percepito dall'utente.
- **Gestione troncamento/errore:** il codice attuale già gestisce il caso in
  cui `JSON.parse(response.text)` fallisce, con un fallback che salva il
  testo grezzo come `feedback`. Lo stesso fallback si applica: se il parsing
  fallisce o il campo `transcript` manca dalla risposta, si salva comunque
  `score`/`feedback` (se disponibili) con `transcript = null`, invece di far
  fallire l'intera analisi. Su registrazioni molto lunghe (fino a ~90 min)
  questo significa che in rari casi la trascrizione potrebbe mancare pur
  avendo un report valido — accettabile, non blocca il flusso principale.
- **Download:** nella card (risultato appena generato e Archivio), bottone
  "Scarica trascrizione" che genera un file `.txt` (nome
  `trascrizione_<data>.txt`). Il bottone non viene mostrato se `transcript`
  è `null`/vuoto (analisi vecchie o troncate), invece di scaricare un file
  vuoto.

## Riascolto e download registrazione

- Sia nella card risultato appena generato sia in ogni card dell'Archivio:
  un elemento `<audio controls>` il cui `src` è un URL firmato ottenuto con
  `supabase.storage.from('recordings').createSignedUrl(file_path, 3600)`
  (validità 1 ora), generato quando la card viene mostrata/aperta — non
  salvato in DB, sempre rigenerato al volo.
- Bottone "Scarica registrazione" che usa lo stesso URL firmato per il
  download, con nome file basato su `file_path`.
- Il bucket `recordings` **resta privato** (nessuna modifica di privacy):
  l'accesso passa sempre da URL firmati generati con la stessa anon key già
  usata oggi per upload/download, coerente col fatto che le registrazioni
  contengono conversazioni commerciali con clienti reali e oggi non c'è
  autenticazione utente.

## Refactor di `page.tsx`

Il file passa da 328 righe monolitiche a un orchestratore leggero che
compone:

- `src/hooks/useRecorder.ts` — logica MediaRecorder, timer, pausa/riprendi
  (estratta 1:1 dalla logica attuale in `page.tsx`, righe 17-112).
- `src/components/NotesInput.tsx` — la textarea di note, riusata sia nella
  schermata iniziale sia nell'overlay durante la registrazione (stesso
  componente, contesto diverso).
- `src/components/RecordingView.tsx` — la vista "registrazione in corso"
  (timer, onde, controlli, overlay note).
- `src/components/ArchiveView.tsx` e `src/components/ArchiveCard.tsx` — la
  vista archivio e la singola card (score, feedback, note in sola lettura,
  player audio, i tre bottoni di download, elimina).
- `page.tsx` mantiene solo lo stato di alto livello (quale vista mostrare,
  risultato analisi corrente) e passa i dati/callback ai componenti.

Ogni componente ha una responsabilità sola e riceve dati/callback via props,
senza logica di rete propria (le chiamate a Supabase/API restano centralizzate
in `page.tsx` o in piccoli helper condivisi), così restano facili da testare
e modificare in isolamento per gli sviluppi futuri già previsti (auth, filtri
di ricerca).

## Setup locale e documentazione

- Il repo `bribit26/bitagora-ai-tutor` è stato clonato nella cartella
  locale del progetto (già fatto in questa sessione), conservando
  `manuale_trattative_commerciali_bitagora.md` come file di riferimento non
  tracciato dal repo (il file effettivamente usato dal backend è
  `src/lib/manuale.md`, già presente nel repo).
- `memory.md` viene sostituito da tre file, secondo la convenzione già in
  uso negli altri progetti dell'utente:
  - `CLAUDE.md` (sotto 200 righe): riferimento rapido, letto per primo a
    inizio sessione.
  - `OVERVIEW.md`: dettaglio architetturale (quanto oggi in `memory.md` più
    le nuove funzionalità di questo spec).
  - `PROGRESS.md`: stato attuale e prossimi passi (sostituisce la sezione
    "Prossimi Passi" di `memory.md`).

## Testing e verifica

Nessuna credenziale reale (Supabase/Gemini) viene condivisa in questa sessione
di lavoro, quindi la verifica in questa fase è limitata a:

- `npm run build` e `npm run lint` senza errori;
- ispezione manuale dei diff per correttezza logica (prompt Gemini, query
  Supabase, gestione stato React);
- verifica visiva dei componenti dove possibile senza backend reale.

Il test end-to-end con audio reale (registrazione → upload → analisi →
trascrizione → riascolto → download) resta a carico dell'utente, che ha le
credenziali Supabase/Gemini/Vercel. Il piano di implementazione (prossimo
step, via `writing-plans`) includerà una checklist di verifica manuale
puntuale per l'utente.

## Rischi noti e mitigazioni

- **Troncamento trascrizione su call lunghe**: mitigato dal fallback già
  descritto (score/feedback restano validi anche se transcript manca).
- **URL firmati e mobile**: `createSignedUrl` richiede una chiamata di rete
  prima di poter riprodurre/scaricare; su connessioni mobile lente il player
  potrebbe impiegare un istante a diventare disponibile — accettabile, non
  blocca la fruizione del resto della card.
- **Refactor come possibile fonte di regressioni**: mitigato tenendo il
  comportamento visibile identico a oggi (stessi stili, stesso flusso
  automatico registra→carica→analizza), spostando solo l'organizzazione del
  codice, non la UX.
