-- Aggiungi le colonne per note di contesto e trascrizione
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS context_notes TEXT;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS transcript TEXT;
