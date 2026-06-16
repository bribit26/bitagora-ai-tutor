-- Aggiungi la colonna score alla tabella analyses
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS score INTEGER;

-- Permetti a chiunque di cancellare record dalla tabella analyses (Anon DELETE Policy)
-- Nota: In un'app reale con login, qui andrebbe specificato il controllo sull'utente
CREATE POLICY "Allow public delete analyses" ON public.analyses FOR DELETE TO anon USING (true);

-- Permetti a chiunque di cancellare file dal bucket recordings (Anon DELETE Policy)
CREATE POLICY "Allow public delete recordings" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'recordings');
