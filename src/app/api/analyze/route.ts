import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processAnalysis } from '@/lib/analysisJob';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// Analizza una trattativa già registrata in `analyses` (il client crea la
// riga subito dopo l'upload dell'audio, così la registrazione non si perde
// anche se l'analisi fallisce). Usata al termine della registrazione e dal
// pulsante "Riprova ora". Restituisce sempre la riga aggiornata: se l'analisi
// non riesce, la riga resta in stato "pending" e verrà ritentata dal job
// automatico (/api/retry-pending).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    let id: string | undefined = body.id;

    // Compatibilità con client vecchi (PWA in cache) che inviano solo il
    // percorso del file: creiamo qui la riga in stato "pending".
    if (!id && body.filePath) {
      const { data, error } = await supabase
        .from('analyses')
        .insert([{ file_path: body.filePath, context_notes: body.contextNotes || null, status: 'pending' }])
        .select('id')
        .single();
      if (error) throw new Error('Errore creazione analisi: ' + error.message);
      id = data.id;
    }

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const row = await processAnalysis(id);
    if (!row) return NextResponse.json({ error: 'Analisi non trovata' }, { status: 404 });
    return NextResponse.json(row);
  } catch (error: unknown) {
    console.error('AI Analysis Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
