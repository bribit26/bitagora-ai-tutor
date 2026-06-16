# BitAgorà AI Tutor - Memory & Handover
**Ultimo aggiornamento:** 12 Giugno 2026

Questo file serve come "memoria" per riprendere esattamente da dove ci siamo fermati.

## 🎯 Stato Attuale (MVP COMPLETATO)
1. **Inizializzazione Progetto**: Creata l'app Next.js (App Router) nella cartella `bitagora-ai-tutor` con UI Vanilla CSS minimalista e pulita.
2. **Registrazione Audio**: Passati dalla `MediaRecorder API` alla libreria `RecordRTC`. Ora registriamo audio in **WAV Mono a 8kHz** (qualità telefono) che è perfettamente supportato dalle API di Gemini e occupa meno di 1 MB al minuto, ottimizzando enormemente lo spazio su Supabase.
3. **Storage (Supabase)**: L'audio viene caricato direttamente nel bucket `recordings` (`src/lib/supabase.ts`).
4. **AI Tutor Backend (`route.ts`)**: 
   - L'audio viene scaricato da Supabase e mandato a **Google Gen AI File API** con controllo di stato (polling su `PROCESSING` finché non diventa `ACTIVE`).
   - Utilizza il modello **Gemini 2.5 Flash** (i vecchi modelli sono stati dismessi sull'account API), che è iper-veloce e ha limiti gratuiti altissimi.
   - Analizza la trattativa usando il `manuale_trattative_commerciali_bitagora.md` e restituisce feedback in italiano.
   - Salva l'analisi nel database Supabase.
5. **Archivio e PWA**: Vista Archivio funzionante e PWA configurata per installazione su mobile.

## 📝 Prossimi Passi
L'MVP è stato concluso, testato con successo su mobile e **deploiato in produzione su Vercel** all'indirizzo: `https://bitagora-ai-tutor.vercel.app/`. 
Inoltre il codice sorgente è versionato su GitHub (`bribit26/bitagora-ai-tutor`).

Le prossime sfide e funzionalità su cui concentrarci sono:
1. **Rifiniture UI/UX dell'Archivio e Menu**: Attualmente il bottone "Archivio" appare solo durante la registrazione, e c'è un'icona "Impostazioni" non funzionante sulla home. Occorre riorganizzare l'interfaccia iniziale per rendere l'Archivio facilmente accessibile, magari sostituendo o integrando l'icona ingranaggio.
2. **Sviluppi Funzionali (Autenticazione)**: Implementare una logica di login/autenticazione. Attualmente tutte le analisi finiscono in un unico database visibile a tutti. Serve dividere i dati per singolo agente di vendita.
3. **Filtri e Ricerca**: Aggiungere all'archivio una barra di ricerca o filtri per data, o punteggio della trattativa.
4. **Ottimizzazione Avanzata Audio**: Valutare compilatori WebAssembly per OGG/MP3 se si vorrà comprimere ulteriormente il file sotto gli 0.3 MB/min in futuro.

---
*Per riprendere il lavoro in futuro, ti basterà farmi leggere questo file `memory.md`!*
