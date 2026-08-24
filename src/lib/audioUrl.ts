import { supabase } from './supabase';

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 ora

export async function getRecordingSignedUrl(filePath: string): Promise<string | null> {
  if (!supabase || !filePath) return null;

  const { data, error } = await supabase.storage
    .from('recordings')
    .createSignedUrl(filePath, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data) {
    console.error('Error creating signed URL', error);
    return null;
  }

  return data.signedUrl;
}
