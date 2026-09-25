import { NextResponse, after } from 'next/server';
import { retryNextPending } from '@/lib/analysisJob';

// Chiamata ogni 10 minuti da pg_cron + pg_net su Supabase (vedi
// supabase_update_v3.sql). Risponde subito e rianalizza in background
// (after) una trattativa in attesa, così la chiamata da Supabase non deve
// restare aperta per tutta la durata dell'analisi.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  after(async () => {
    try {
      await retryNextPending();
    } catch (error) {
      console.error('Retry job error:', error);
    }
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
