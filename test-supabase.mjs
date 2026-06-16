import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

async function testUpload() {
  console.log("Testing Supabase Upload...");
  const dummyData = new Blob(['test audio content'], { type: 'audio/webm' });
  const fileName = `test_rec_${Date.now()}.webm`;
  
  const { data, error } = await supabase.storage
    .from('recordings')
    .upload(fileName, dummyData, { contentType: 'audio/webm' });

  if (error) {
    console.error("Upload Error:", error.message);
  } else {
    console.log("Upload Success:", data);
  }
}

testUpload();
