# PROGRESS — BitAgorà AI Tutor

## Stato attuale (2026-08-24)

MVP completato a giugno 2026 (registrazione, analisi Gemini, archivio,
PWA), deployato in produzione su Vercel. In questa sessione sono state
aggiunte, tramite il flusso Superpowers (brainstorming → spec →
writing-plans), tre funzionalità ispirate a Granola:

1. Riascolto e download della registrazione audio (URL firmati Supabase).
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

**Non testato end-to-end con credenziali reali in questa sessione** (nessuna
chiave Supabase/Gemini condivisa). Verificato solo `npm run build` +
`npm run lint` + ispezione dei diff. Il test reale (registrare, verificare
trascrizione/note/player, applicare `supabase_update_v2.sql` su Supabase)
resta da fare a Daniele prima del deploy in produzione — vedi la checklist
in Task 12 del piano di implementazione.

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
  valutare di passare a una chiamata Gemini dedicata solo alla trascrizione
  (opzione già scartata in fase di spec per non raddoppiare tempo/costo).
