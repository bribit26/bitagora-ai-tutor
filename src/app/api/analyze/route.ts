import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// Initialize Gemini SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const { filePath } = await req.json();
    if (!filePath) return NextResponse.json({ error: 'Missing filePath' }, { status: 400 });

    console.log("Downloading audio from Supabase:", filePath);
    const { data: audioData, error } = await supabase.storage.from('recordings').download(filePath);
    if (error || !audioData) throw new Error('Error downloading from Supabase: ' + (error?.message || 'No data'));

    const arrayBuffer = await audioData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to /tmp for Google Gen AI File API (supports large files > 20MB)
    const tmpPath = path.join(os.tmpdir(), `audio-${Date.now()}.wav`);
    fs.writeFileSync(tmpPath, buffer);

    console.log("Uploading to Google Gen AI...");
    let fileInfo = await ai.files.upload({
      file: tmpPath,
      config: { mimeType: 'audio/wav' },
    });

    console.log(`File uploaded. Initial state: ${fileInfo.state}`);
    while (fileInfo.state === 'PROCESSING') {
      console.log('Waiting for audio processing...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      fileInfo = await ai.files.get({ name: fileInfo.name! });
    }

    if (fileInfo.state === 'FAILED') {
      throw new Error("L'elaborazione del file audio da parte di Google AI è fallita.");
    }

    // Get the manual content
    const manualPath = path.join(process.cwd(), 'src/lib/manuale.md');
    let manualText = "";
    if (fs.existsSync(manualPath)) {
      manualText = fs.readFileSync(manualPath, 'utf-8');
    }

    const prompt = `Sei l'AI Tutor senior di BitAgorà. 
Ascolta attentamente la registrazione di questa trattativa commerciale.
In base alle regole e ai principi descritti nel seguente "Manuale operativo":
${manualText}

Assegna un "Voto" da 1 a 100 alla trattativa in base alla conformità con il manuale.
Fornisci inoltre una recensione in italiano in formato Markdown, strutturata in:
1. Sintesi della trattativa.
2. Punti di forza (cosa ha fatto bene il commerciale).
3. Aree di miglioramento (cosa mancava o è stato gestito male secondo il manuale).
4. Suggerimenti pratici (cosa dire o fare al prossimo incontro).

Devi restituire un oggetto JSON ESATTAMENTE con questa struttura:
{
  "score": <numero intero da 1 a 100>,
  "feedback": "<Il testo della recensione in formato Markdown>"
}`;

    console.log("Generating content...");
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        responseMimeType: "application/json",
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { fileData: { fileUri: fileInfo.uri!, mimeType: fileInfo.mimeType || 'audio/wav' } }
          ]
        }
      ]
    });

    // Cleanup
    fs.unlinkSync(tmpPath);
    try {
      await ai.files.delete({ name: fileInfo.name! });
    } catch (e) {
      console.warn("Could not delete file from Google AI", e);
    }

    let resultJson = { score: 0, feedback: "Errore nella generazione." };
    try {
      if (response.text) {
        resultJson = JSON.parse(response.text);
      }
    } catch (e) {
      console.error("Failed to parse Gemini JSON:", e, response.text);
      resultJson.feedback = response.text || "";
    }

    // Save feedback to Supabase DB
    const { error: dbError } = await supabase
      .from('analyses')
      .insert([
        { file_path: filePath, feedback: resultJson.feedback, score: resultJson.score }
      ]);
      
    if (dbError) {
      console.error("Error saving to DB:", dbError);
    }

    return NextResponse.json({ feedback: resultJson.feedback, score: resultJson.score });

  } catch (error: any) {
    console.error('AI Analysis Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
