# PROGRESS — BitAgorà AI Tutor

## Stato attuale (2026-08-25)

MVP completato a giugno 2026 (registrazione, analisi Gemini, archivio,
PWA), deployato in produzione su Vercel. Il 2026-08-24 sono state aggiunte,
tramite il flusso Superpowers (brainstorming → spec → writing-plans →
subagent-driven-development), tre funzionalità ispirate a Granola:

1. Riascolto e download della registrazione audio (URL firmati Supabase,
   uno per la riproduzione e uno separato con `Content-Disposition:
   attachment` per il download vero e proprio, dato che un URL Supabase è
   cross-origin e il solo attributo `download` dell'HTML viene ignorato).
2. Download della trascrizione integrale (generata da Gemini nella stessa
   chiamata usata per il punteggio/feedback).
3. Note di contesto inseribili prima e durante la registrazione, usate per
   calibrare l'analisi dell'AI (es. non penalizzare una discovery assente
   se il contesto dice che è già stata fatta in un incontro precedente).

Come parte di questo lavoro, `page.tsx` (prima monolitico, 328 righe) è
stato scomposto in componenti dedicati sotto `src/components/` e un hook
`useRecorder` — vedi `OVERVIEW.md` per la mappa completa.

Spec e piano di questo lavoro: `docs/superpowers/specs/2026-08-24-tutor-debrief-features-design.md`
e `docs/superpowers/plans/2026-08-24-tutor-debrief-features.md`.

**Implementazione completata, revisionata e mergiata in locale su `main`**
(commit `0422aa4`, 16 commit totali: 12 task del piano + 5 fix da una review
finale sull'intero branch). La review finale aveva trovato e fatto
correggere:
- **1 bug Critical**: le note scritte tramite l'overlay *durante* la
  registrazione venivano scartate (closure "stale" su `onRecordingComplete`
  in `useRecorder.ts`) — solo le note scritte *prima* di iniziare
  arrivavano davvero all'analisi. Risolto con un ref sempre aggiornato.
- **4 Important**: download registrazione che apriva una scheda invece di
  scaricare (vedi punto 1 sopra); note di contesto iniettate senza
  delimitatori nel prompt Gemini (ora avvolte in `<contesto_commerciale>`
  con istruzione esplicita di non trattarle come comandi); una frase in
  `OVERVIEW.md` che sovrastimava la robustezza del fallback su JSON
  troncato (corretta); l'import `@AGENTS.md` perso nella riscrittura di
  `CLAUDE.md` (ripristinato).

Restano **7 note Minor**, non bloccanti, non ancora affrontate: note
composte di soli spazi vengono comunque salvate come non vuote; il render
del feedback non ha un guard se Gemini omettesse il campo `feedback`;
l'archivio fa una richiesta di URL firmato per ogni card in parallelo (può
diventare pesante con molte trattative); gli URL firmati scadono dopo 1h
senza refresh automatico; `AnalysisCard` non azzera l'URL audio se cambia
`file_path` senza smontare il componente; `NotesOverlay` non si chiude con
Esc e non ha ruolo ARIA da dialog; `NotesInput` ha un `id` fisso (rischio
solo se due istanze fossero mai montate insieme, oggi non succede).

**Pushato su GitHub e verificato funzionante.** `main` locale è stato
pushato su `origin/main` (`623a01b..282e03a`, 21 commit). Daniele ha
applicato `supabase_update_v2.sql` da SQL Editor e fatto il test manuale:
tutto funziona (registrazione, note pre/durante-call, riascolto/download,
trascrizione, archivio).

**Decisione 2026-08-25: restare su Gemini, nessuna integrazione Claude.**
Proposto di dividere la pipeline (Gemini per trascrizione audio→testo,
Claude per il giudizio punteggio/feedback sul testo, per ridurre il danno
di un eventuale troncamento su call molto lunghe) — Daniele ha deciso di
non procedere per ora: siamo in fase di test interna con pochi dati
attesi, niente costi aggiuntivi anche minimi in questa fase, si osserva
prima se il consumo/troncamento token di Gemini è un problema reale con
l'uso vero. Non riproporre l'aggiunta di Claude finché non emergono
problemi concreti o Daniele non lo richiede di nuovo.

**Sessione chiusa qui per ora.** Nessun lavoro aperto in sospeso.

## Prossimi passi (ereditati dal vecchio memory.md, ancora aperti)

1. **Autenticazione**: oggi tutte le analisi sono in un unico DB condiviso
   tra i commerciali. Serve login e separazione dati per agente.
2. **Filtri e ricerca** in Archivio: per data o punteggio.
3. **Rifiniture UI/UX minori**: valutare se integrare ulteriormente l'icona
   Archivio nella home ora che l'Archivio è raggiungibile sia dalla home sia
   durante la registrazione.

## Prossimi passi emersi da questo lavoro (da valutare in futuro, fuori scope ora)

- Pacchetto di download "debrief combinato" (audio + trascrizione + report
  in un unico file), scartato per ora per tenere lo scope contenuto.
- Se le trascrizioni su chiamate molto lunghe (~90 min) risultano tagliate,
  valutare di passare a una chiamata Gemini dedicata solo alla trascrizione,
  o a un output strutturato (`responseSchema`) invece del solo prompt
  descrittivo (opzione già scartata in fase di spec per non raddoppiare
  tempo/costo; `maxOutputTokens` è già impostato al massimo consentito dal
  modello, ma coincide col default quindi non riduce davvero il rischio).
- Le 7 note Minor elencate sopra in "Stato attuale".
