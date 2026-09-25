-- v3: stato delle analisi e nuovi tentativi automatici.
-- Da eseguire nel SQL Editor di Supabase PRIMA del deploy del codice che lo usa.
-- Le righe già esistenti diventano "done" e non vengono toccate.

-- =====================================================================
-- PARTE 1 — Colonne di stato
-- =====================================================================

-- La riga viene ora creata subito dopo l'upload, prima che esista un feedback.
ALTER TABLE public.analyses ALTER COLUMN feedback DROP NOT NULL;

-- pending | processing | done | failed
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done';
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP WITH TIME ZONE;

-- Permetti l'aggiornamento delle righe (esito dell'analisi e nuovi tentativi).
-- Come per insert/select/delete, in un'app con login andrebbe limitato all'utente.
DROP POLICY IF EXISTS "Allow public update analyses" ON public.analyses;
CREATE POLICY "Allow public update analyses" ON public.analyses FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- =====================================================================
-- PARTE 2 — Job automatico ogni 10 minuti
-- Prima di eseguire: sostituisci INCOLLA_QUI_IL_CRON_SECRET con lo stesso
-- valore della variabile CRON_SECRET impostata su Vercel.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Se il job esiste già con questo nome, viene aggiornato.
SELECT cron.schedule(
  'retry-pending-analyses',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bitagora-ai-tutor.vercel.app/api/retry-pending',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer INCOLLA_QUI_IL_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Verifiche utili (facoltative):
--   SELECT * FROM cron.job;                                                  -- il job esiste
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;     -- esecuzioni del job
--   SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;  -- 202 = ok, 401 = secret errato
-- Per disattivare il job:
--   SELECT cron.unschedule('retry-pending-analyses');
