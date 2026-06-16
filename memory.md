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

## 📝 Prossimi Passi (Per Lunedì)
Il Minimum Viable Product (MVP) è concluso e testato con successo in locale.
Lunedì potremo concentrarci su:
1. **Rifiniture UI/UX**: Migliorare l'aspetto estetico, l'accessibilità o i feedback visivi durante l'attesa.
2. **Sviluppi Funzionali**: Implementare nuove feature (es. logica di auth, filtri per l'archivio).
3. **Deploy (Vercel)**: Preparare e lanciare l'app online così da poterla usare dal cellulare fuori dall'ufficio.
4. **Ottimizzazione Avanzata Audio**: Valutare compilatori WebAssembly per OGG/MP3 se si vorrà comprimere il file sotto gli 0.3 MB/min.

---
*Per riprendere il lavoro lunedì, ti basterà farmi leggere questo file `memory.md`!*
