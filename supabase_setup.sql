-- Tabella per salvare lo storico delle analisi
CREATE TABLE IF NOT EXISTS public.analyses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    file_path TEXT NOT NULL,
    feedback TEXT NOT NULL
);

-- Abilitiamo la RLS (Row Level Security)
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

-- Creiamo una policy per permettere agli utenti anonimi di leggere e scrivere
-- (In un'app reale con autenticazione, cambieremmo 'anon' con 'authenticated')
CREATE POLICY "Allow public insert" ON public.analyses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public select" ON public.analyses FOR SELECT TO anon USING (true);
