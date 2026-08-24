# BitAgorà AI Tutor: Debrief Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recording playback/download, full transcript generation/download, and pre/during-call context notes that calibrate the AI analysis, to the existing bitagora-ai-tutor app.

**Architecture:** Extend the existing single-call Gemini analysis (`/api/analyze`) to also return a transcript and to accept context notes that get woven into the prompt; add two nullable DB columns to persist them; split the current monolithic `page.tsx` into a `useRecorder` hook plus presentational components (`NotesInput`, `NotesOverlay`, `RecordingView`, `AnalysisCard`, `ArchiveView`) that `page.tsx` orchestrates; access recordings for playback/download via Supabase signed URLs generated on demand (bucket stays private).

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript (strict), CSS Modules, Supabase (`@supabase/supabase-js`), Google Gemini 2.5 Flash (`@google/genai`).

## Global Constraints

- TypeScript strict mode is on (`tsconfig.json`) — new code must typecheck under `npx tsc --noEmit`. Matching the existing codebase's own looseness (e.g. `useRef<any>` for the MediaRecorder instance) is acceptable where the original code already did it; don't introduce new `any` beyond that pattern.
- **No test framework is configured in this project** (no jest/vitest/testing-library in `package.json`). Do not add one as part of this plan — it's out of scope. Verification per task is `npx tsc --noEmit` + `npm run lint`, plus a final manual end-to-end checklist (Task 12) for the user, per the spec's Testing section.
- Follow the existing CSS Modules pattern: one `*.module.css` file colocated with each component/page, reusing the CSS variables already defined in `src/app/globals.css` (`--background`, `--foreground`, `--primary`, `--border`, `--text-muted`, `--surface`) instead of hardcoding new colors, except where matching an existing hardcoded value (e.g. score colors `#4caf50`/`#ffeb3b`/`#f44336`, delete-button red `#ff4444`).
- All user-facing strings (labels, buttons, alerts) are in Italian, matching the existing UI.
- The Supabase bucket `recordings` **stays private** — always access recordings via `supabase.storage.from('recordings').createSignedUrl(...)`, never make the bucket public. This was an explicit decision during brainstorming.
- Network calls (Supabase queries, `fetch('/api/analyze')`) stay centralized in `src/app/page.tsx`; components under `src/components/` are presentational and receive data/callbacks via props, except the small shared helper `src/lib/audioUrl.ts` which owns the signed-URL call so it isn't duplicated.
- Package manager is npm (`package-lock.json` present, no yarn/pnpm lockfile).
- Repo location: `C:\Users\DanieleBrini\Documents\CLAUDE\bitagora-ai-tutor` (already a working git clone of `bribit26/bitagora-ai-tutor`, branch `main`). No real Supabase/Gemini credentials are available in this session — do not attempt to create `.env.local` with real keys or run `npm run dev` against live services.

---

## Task 1: Environment setup + database migration script

**Files:**
- Create: `supabase_update_v2.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: two new nullable columns (`context_notes`, `transcript`) on `public.analyses`, consumed conceptually by Task 2 (which writes to them) and Task 8 (which reads them via `AnalysisItem`).

- [ ] **Step 1: Install dependencies**

The repo was freshly cloned and `node_modules` doesn't exist yet. Every later task's typecheck/lint step depends on this.

Run: `cd "C:\Users\DanieleBrini\Documents\CLAUDE\bitagora-ai-tutor" && npm install`
Expected: completes without errors (warnings about deprecated sub-dependencies are fine).

- [ ] **Step 2: Write the migration file**

```sql
-- Aggiungi le colonne per note di contesto e trascrizione
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS context_notes TEXT;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS transcript TEXT;
```

Save as `supabase_update_v2.sql` at the repo root, matching the style of the existing `supabase_setup.sql` / `supabase_update.sql`.

- [ ] **Step 3: Verify baseline build works**

Run: `npm run build`
Expected: build succeeds (this establishes the pre-change baseline before any code edits — if it fails here, that's a pre-existing issue, not something introduced by this plan).

- [ ] **Step 4: Commit**

```bash
git add supabase_update_v2.sql
git commit -m "chore: add DB migration for context_notes and transcript columns"
```

---

## Task 2: Extend `/api/analyze` — accept context notes, return a transcript

**Files:**
- Modify (full replacement): `src/app/api/analyze/route.ts`

**Interfaces:**
- Consumes: `POST` body `{ filePath: string, contextNotes?: string }` (new: `contextNotes` optional field on top of existing `filePath`).
- Produces: `POST` response `{ feedback: string, score: number, transcript: string | null }` (new: `transcript` field). Consumed by `src/app/page.tsx` in Task 10.
- Persists to Supabase table `analyses`: adds `context_notes` and `transcript` to the existing insert (columns created in Task 1).

- [ ] **Step 1: Replace the route file**

```ts
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
    const { filePath, contextNotes } = await req.json();
    if (!filePath) return NextResponse.json({ error: 'Missing filePath' }, { status: 400 });

    console.log("Downloading audio from Supabase:", filePath);
    const { data: audioData, error } = await supabase.storage.from('recordings').download(filePath);
    if (error || !audioData) throw new Error('Error downloading from Supabase: ' + (error?.message || 'No data'));

    const arrayBuffer = await audioData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Estrarre l'estensione del file dal path (es. .webm, .mp4, .wav)
    const fileExt = path.extname(filePath) || '.wav';
    const mimeType = fileExt === '.webm' ? 'audio/webm' :
                     fileExt === '.mp4' ? 'audio/mp4' :
                     fileExt === '.ogg' ? 'audio/ogg' : 'audio/wav';

    // Save to /tmp for Google Gen AI File API (supports large files > 20MB)
    const tmpPath = path.join(os.tmpdir(), `audio-${Date.now()}${fileExt}`);
    fs.writeFileSync(tmpPath, buffer);

    console.log("Uploading to Google Gen AI...");
    let fileInfo = await ai.files.upload({
      file: tmpPath,
      config: { mimeType: mimeType },
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

    const contextSection = contextNotes && String(contextNotes).trim().length > 0
      ? `\nContesto fornito dal commerciale prima/durante la chiamata: ${String(contextNotes).trim()}. Tienine conto nella valutazione: ad esempio non penalizzare l'assenza di una fase (come la discovery) se il contesto indica che è già stata svolta in un incontro precedente.\n`
      : '';

    const prompt = `Sei l'AI Tutor senior di BitAgorà. 
Ascolta attentamente la registrazione di questa trattativa commerciale.
In base alle regole e ai principi descritti nel seguente "Manuale operativo":
${manualText}
${contextSection}
Assegna un "Voto" da 1 a 100 alla trattativa in base alla conformità con il manuale.
Fornisci inoltre una recensione in italiano in formato Markdown, strutturata in:
1. Sintesi della trattativa.
2. Punti di forza (cosa ha fatto bene il commerciale).
3. Aree di miglioramento (cosa mancava o è stato gestito male secondo il manuale).
4. Suggerimenti pratici (cosa dire o fare al prossimo incontro).

Trascrivi inoltre integralmente la conversazione, etichettando i turni di parola con "Cliente:" e "Commerciale:" dove riesci a distinguerli.

Devi restituire un oggetto JSON ESATTAMENTE con questa struttura:
{
  "score": <numero intero da 1 a 100>,
  "feedback": "<Il testo della recensione in formato Markdown>",
  "transcript": "<La trascrizione integrale della conversazione>"
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
            { fileData: { fileUri: fileInfo.uri!, mimeType: fileInfo.mimeType || mimeType } }
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

    let resultJson: { score: number; feedback: string; transcript: string | null } = {
      score: 0,
      feedback: "Errore nella generazione.",
      transcript: null,
    };
    try {
      if (response.text) {
        resultJson = JSON.parse(response.text);
      }
    } catch (e) {
      console.error("Failed to parse Gemini JSON:", e, response.text);
      resultJson.feedback = response.text || "";
      resultJson.transcript = null;
    }

    // Save feedback to Supabase DB
    const { error: dbError } = await supabase
      .from('analyses')
      .insert([
        {
          file_path: filePath,
          feedback: resultJson.feedback,
          score: resultJson.score,
          context_notes: contextNotes || null,
          transcript: resultJson.transcript || null,
        }
      ]);
      
    if (dbError) {
      console.error("Error saving to DB:", dbError);
    }

    return NextResponse.json({
      feedback: resultJson.feedback,
      score: resultJson.score,
      transcript: resultJson.transcript || null,
    });

  } catch (error: any) {
    console.error('AI Analysis Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `src/app/api/analyze/route.ts`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors/warnings from this file.

- [ ] **Step 4: Manual review checklist**

Confirm by reading the file: (a) `contextSection` is only non-empty when `contextNotes` is a non-empty trimmed string, (b) the JSON parse failure path still leaves `score`/`feedback` usable and sets `transcript: null` rather than throwing, (c) `context_notes`/`transcript` are only ever `null` or a string when inserted (never `undefined`, which Supabase would reject).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/analyze/route.ts
git commit -m "feat: accept context notes and return transcript from analyze API"
```

---

## Task 3: Signed URL helper for recordings

**Files:**
- Create: `src/lib/audioUrl.ts`

**Interfaces:**
- Consumes: `supabase` client from `src/lib/supabase.ts` (existing, may be `null` if env vars are missing — must be handled, same pattern already used elsewhere in the codebase).
- Produces: `getRecordingSignedUrl(filePath: string): Promise<string | null>`, consumed by `AnalysisCard` in Task 8.

- [ ] **Step 1: Write the helper**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/audioUrl.ts
git commit -m "feat: add signed URL helper for playing/downloading recordings"
```

---

## Task 4: Extract recording logic into `useRecorder` hook

**Files:**
- Create: `src/hooks/useRecorder.ts`

**Interfaces:**
- Consumes: nothing external (browser `MediaRecorder`/`navigator.mediaDevices` APIs only).
- Produces:
  - `formatTime(seconds: number): string` (named export)
  - `useRecorder(onRecordingComplete: (blob: Blob) => void): { isRecording: boolean; isPaused: boolean; recordingTime: number; startRecording: () => Promise<void>; togglePause: () => void; stopRecording: () => void }` (named export)
  - Consumed by `src/components/RecordingView.tsx` (Task 7, for `formatTime`) and `src/app/page.tsx` (Task 10, for the hook itself).

- [ ] **Step 1: Write the hook**

This is the recording state machine extracted verbatim from the current `src/app/page.tsx` (lines 8-112), with one behavior change: instead of calling `handleUpload` directly, `recorder.onstop` calls the `onRecordingComplete` callback passed in — the caller (page.tsx) decides what to do with the finished blob. The `setAnalysisResult(null)` call that used to happen at the start of `startRecording` is **not** included here — it's a page-level concern, moved to a wrapper in Task 10.

```ts
import { useState, useRef, useEffect } from "react";

export function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function useRecorder(onRecordingComplete: (blob: Blob) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const options: any = { audioBitsPerSecond: 24000 };
      if (mimeType) options.mimeType = mimeType;

      const recorder = new MediaRecorder(stream, options);
      const audioChunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const finalMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunks, { type: finalMimeType });
        setIsRecording(false);
        setIsPaused(false);

        onRecordingComplete(audioBlob);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // Raccoglie chunk ogni secondo per sicurezza

      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
    } catch (err) {
      console.error("Error accessing microphone", err);
      alert("Permesso microfono negato o errore.");
    }
  };

  const togglePause = () => {
    if (mediaRecorderRef.current) {
      const state = mediaRecorderRef.current.state;
      if (state === "recording") {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      } else if (state === "paused") {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  return { isRecording, isPaused, recordingTime, startRecording, togglePause, stopRecording };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRecorder.ts
git commit -m "refactor: extract MediaRecorder logic into useRecorder hook"
```

---

## Task 5: `NotesInput` component

**Files:**
- Create: `src/components/NotesInput.tsx`
- Create: `src/components/NotesInput.module.css`

**Interfaces:**
- Consumes: nothing.
- Produces: default export `NotesInput`, props type `NotesInputProps { value: string; onChange: (value: string) => void; label?: string; placeholder?: string; autoFocus?: boolean }`. Consumed by `NotesOverlay` (Task 6) and `page.tsx` (Task 10).

- [ ] **Step 1: Write the CSS module**

```css
.wrapper {
  width: 100%;
}

.label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}

.textarea {
  width: 100%;
  min-height: 80px;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background-color: var(--surface);
  color: var(--foreground);
  font-family: inherit;
  font-size: 0.9rem;
  resize: vertical;
}

.textarea:focus {
  outline: none;
  border-color: var(--primary);
}
```

Save as `src/components/NotesInput.module.css`.

- [ ] **Step 2: Write the component**

```tsx
"use client";

import styles from "./NotesInput.module.css";

export interface NotesInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function NotesInput({
  value,
  onChange,
  label = "Contesto per l'AI Tutor",
  placeholder = "Es. call di approfondimento, discovery già fatta in precedenza...",
  autoFocus = false,
}: NotesInputProps) {
  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor="context-notes">{label}</label>
      <textarea
        id="context-notes"
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}
```

Save as `src/components/NotesInput.tsx`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/NotesInput.tsx src/components/NotesInput.module.css
git commit -m "feat: add NotesInput component for context notes"
```

---

## Task 6: `NotesOverlay` component

**Files:**
- Create: `src/components/NotesOverlay.tsx`
- Create: `src/components/NotesOverlay.module.css`

**Interfaces:**
- Consumes: `NotesInput` default export and `NotesInputProps` shape (Task 5).
- Produces: default export `NotesOverlay`, props type `NotesOverlayProps { value: string; onChange: (value: string) => void; onClose: () => void }`. Consumed by `RecordingView` (Task 7).

- [ ] **Step 1: Write the CSS module**

```css
.backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;
  z-index: 100;
}

.panel {
  width: 100%;
  background-color: var(--background);
  border-radius: 16px 16px 0 0;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.doneBtn {
  align-self: flex-end;
  padding: 0.6rem 1.5rem;
  border-radius: 8px;
  border: none;
  background-color: var(--foreground);
  color: var(--background);
  font-weight: 600;
  cursor: pointer;
}
```

Save as `src/components/NotesOverlay.module.css`.

- [ ] **Step 2: Write the component**

```tsx
"use client";

import styles from "./NotesOverlay.module.css";
import NotesInput from "./NotesInput";

export interface NotesOverlayProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

export default function NotesOverlay({ value, onChange, onClose }: NotesOverlayProps) {
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <NotesInput
          value={value}
          onChange={onChange}
          label="Note sulla trattativa in corso"
          placeholder="Annota qui cosa sta emergendo durante la chiamata..."
          autoFocus
        />
        <button className={styles.doneBtn} onClick={onClose}>Fatto</button>
      </div>
    </div>
  );
}
```

Save as `src/components/NotesOverlay.tsx`. The backdrop's `onClick={onClose}` combined with the panel's `onClick={(e) => e.stopPropagation()}` means tapping outside the panel closes it, tapping inside doesn't — the recording keeps running underneath in both cases since this overlay has no effect on `useRecorder`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/NotesOverlay.tsx src/components/NotesOverlay.module.css
git commit -m "feat: add NotesOverlay for editing notes during recording"
```

---

## Task 7: `RecordingView` component

**Files:**
- Create: `src/components/RecordingView.tsx`
- Create: `src/components/RecordingView.module.css`

**Interfaces:**
- Consumes: `formatTime` from `src/hooks/useRecorder.ts` (Task 4); `NotesOverlay` default export (Task 6).
- Produces: default export `RecordingView`, props type `RecordingViewProps { recordingTime: number; isPaused: boolean; notes: string; onNotesChange: (value: string) => void; onStop: () => void; onTogglePause: () => void; onOpenArchive: () => void }`. Consumed by `page.tsx` (Task 10).

- [ ] **Step 1: Write the CSS module**

Moved verbatim from the current `src/app/page.module.css` (the `.recordingState` through `.controlLabel` block), plus `.recordDot` duplicated here (also needed for the pause/resume icon, and CSS Modules don't share classes across files) and a new `.noteIcon` for the Note button's emoji.

```css
.recordingState {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  flex: 1;
  margin-top: 4rem;
}

.timer {
  font-size: 3rem;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  margin-bottom: 0.5rem;
}

.recordingText {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin-bottom: 4rem;
}

.waveContainer {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.wave {
  width: 100%;
  height: 60px;
  background: linear-gradient(90deg, transparent, rgba(0, 122, 255, 0.5), transparent);
  border-radius: 30px;
  opacity: 0.5;
}

.controls {
  display: flex;
  justify-content: space-around;
  align-items: center;
  width: 100%;
  padding-bottom: 2rem;
}

.controlBtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
}

.controlBtnPrimary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
}

.iconCircle {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background-color: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.iconCirclePrimary {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background-color: var(--foreground);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--background);
}

.stopSquare {
  width: 16px;
  height: 16px;
  background-color: var(--primary);
  border-radius: 3px;
}

.pauseBars {
  display: flex;
  gap: 6px;
}

.pauseBar {
  width: 5px;
  height: 20px;
  background-color: var(--background);
  border-radius: 2px;
}

.recordDot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background-color: var(--primary);
}

.menuLines {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.menuLine {
  width: 18px;
  height: 2px;
  background-color: var(--foreground);
}

.controlLabel {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.noteIcon {
  font-size: 1.2rem;
}
```

Save as `src/components/RecordingView.module.css`.

- [ ] **Step 2: Write the component**

```tsx
"use client";

import { useState } from "react";
import styles from "./RecordingView.module.css";
import NotesOverlay from "./NotesOverlay";
import { formatTime } from "@/hooks/useRecorder";

export interface RecordingViewProps {
  recordingTime: number;
  isPaused: boolean;
  notes: string;
  onNotesChange: (value: string) => void;
  onStop: () => void;
  onTogglePause: () => void;
  onOpenArchive: () => void;
}

export default function RecordingView({
  recordingTime,
  isPaused,
  notes,
  onNotesChange,
  onStop,
  onTogglePause,
  onOpenArchive,
}: RecordingViewProps) {
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <div className={styles.recordingState}>
      <h2 className={styles.timer}>{formatTime(recordingTime)}</h2>
      <p className={styles.recordingText}>
        {isPaused ? "In pausa..." : "Registrazione in corso..."}
      </p>

      <div className={styles.waveContainer}>
        <div className={styles.wave} style={{ opacity: isPaused ? 0.2 : 0.5 }}></div>
      </div>

      <div className={styles.controls}>
        <button className={styles.controlBtn} onClick={onStop}>
          <div className={styles.iconCircle}>
            <div className={styles.stopSquare}></div>
          </div>
          <span className={styles.controlLabel}>Termina</span>
        </button>
        <button className={styles.controlBtnPrimary} onClick={onTogglePause}>
          <div className={styles.iconCirclePrimary}>
            {isPaused ? (
              <div className={styles.recordDot} style={{ width: '20px', height: '20px' }}></div>
            ) : (
              <div className={styles.pauseBars}>
                <div className={styles.pauseBar}></div>
                <div className={styles.pauseBar}></div>
              </div>
            )}
          </div>
          <span className={styles.controlLabel}>{isPaused ? "Riprendi" : "Pausa"}</span>
        </button>
        <button className={styles.controlBtn} onClick={() => setNotesOpen(true)}>
          <div className={styles.iconCircle}>
            <span className={styles.noteIcon}>📝</span>
          </div>
          <span className={styles.controlLabel}>Note</span>
        </button>
        <button className={styles.controlBtn} onClick={onOpenArchive}>
          <div className={styles.iconCircle}>
            <div className={styles.menuLines}>
              <div className={styles.menuLine}></div>
              <div className={styles.menuLine}></div>
              <div className={styles.menuLine}></div>
            </div>
          </div>
          <span className={styles.controlLabel}>Archivio</span>
        </button>
      </div>

      {notesOpen && (
        <NotesOverlay
          value={notes}
          onChange={onNotesChange}
          onClose={() => setNotesOpen(false)}
        />
      )}
    </div>
  );
}
```

Save as `src/components/RecordingView.tsx`. Note the "Note" button's `onClick` only toggles local `notesOpen` state — it does not call `onTogglePause` or `onStop`, so the recording (owned by `useRecorder` in the parent) is unaffected by opening/closing the overlay.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/RecordingView.tsx src/components/RecordingView.module.css
git commit -m "feat: add RecordingView component with Note control"
```

---

## Task 8: `AnalysisCard` component

**Files:**
- Create: `src/components/AnalysisCard.tsx`
- Create: `src/components/AnalysisCard.module.css`

**Interfaces:**
- Consumes: `getRecordingSignedUrl` from `src/lib/audioUrl.ts` (Task 3).
- Produces: named export `AnalysisItem { id?: string; created_at?: string; file_path: string; feedback: string; score: number; context_notes?: string | null; transcript?: string | null }`; default export `AnalysisCard`, props type `AnalysisCardProps { item: AnalysisItem; onDelete?: (id: string, filePath: string) => void }`. Consumed by `ArchiveView` (Task 9) and `page.tsx` (Task 10).
- This single component is used both for the "just analyzed" result card and for each card in the Archive — the spec calls for identical UI (score, feedback, notes, player, three downloads) in both places, so one shared component replaces what would otherwise be near-duplicate JSX. The delete button only renders when both `onDelete` and `item.id` are present (the just-generated result has no `id` yet since the insert response doesn't return one — matching today's behavior, where that card has no delete button either).

- [ ] **Step 1: Write the CSS module**

```css
.card {
  background-color: var(--surface);
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.headerRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.date {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: bold;
}

.scoreBadge {
  display: flex;
  align-items: center;
  gap: 5px;
}

.scoreDot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.notesBox {
  background-color: var(--background);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem;
  font-size: 0.85rem;
}

.notesLabel {
  display: block;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
  font-size: 0.75rem;
  text-transform: uppercase;
}

.markdownContent {
  font-size: 0.95rem;
  line-height: 1.6;
}

.markdownContent strong {
  color: var(--foreground);
}

.audioPlayer {
  width: 100%;
}

.actionsRow {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.actionBtn {
  padding: 5px 15px;
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: none;
  color: var(--foreground);
  font-size: 0.85rem;
}

.actionBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.deleteBtn {
  padding: 5px 15px;
  cursor: pointer;
  border: 1px solid #ff4444;
  color: #ff4444;
  border-radius: 5px;
  background: none;
  font-size: 0.85rem;
}
```

Save as `src/components/AnalysisCard.module.css`.

- [ ] **Step 2: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import styles from "./AnalysisCard.module.css";
import { getRecordingSignedUrl } from "@/lib/audioUrl";

export interface AnalysisItem {
  id?: string;
  created_at?: string;
  file_path: string;
  feedback: string;
  score: number;
  context_notes?: string | null;
  transcript?: string | null;
}

export interface AnalysisCardProps {
  item: AnalysisItem;
  onDelete?: (id: string, filePath: string) => void;
}

function getScoreColor(score: number) {
  if (!score) return '#ccc';
  if (score >= 80) return '#4caf50';
  if (score >= 50) return '#ffeb3b';
  return '#f44336';
}

export default function AnalysisCard({ item, onDelete }: AnalysisCardProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRecordingSignedUrl(item.file_path).then((url) => {
      if (!cancelled) setAudioUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [item.file_path]);

  const dateLabel = item.created_at
    ? new Date(item.created_at).toLocaleString('it-IT')
    : new Date().toLocaleString('it-IT');
  const fileDateSuffix = item.created_at
    ? new Date(item.created_at).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const downloadFeedback = () => {
    const blob = new Blob([item.feedback], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analisi_trattativa_${fileDateSuffix}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTranscript = () => {
    if (!item.transcript) return;
    const blob = new Blob([item.transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trascrizione_${fileDateSuffix}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAudio = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = item.file_path.split('/').pop() || 'registrazione';
    a.click();
  };

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <p className={styles.date}>{dateLabel}</p>
        {!!item.score && (
          <div className={styles.scoreBadge}>
            <div className={styles.scoreDot} style={{ backgroundColor: getScoreColor(item.score) }}></div>
            <strong>{item.score}/100</strong>
          </div>
        )}
      </div>

      {item.context_notes && (
        <div className={styles.notesBox}>
          <span className={styles.notesLabel}>Contesto fornito</span>
          <p>{item.context_notes}</p>
        </div>
      )}

      <div className={styles.markdownContent} dangerouslySetInnerHTML={{ __html: item.feedback.replace(/\n/g, '<br/>') }}></div>

      {audioUrl && (
        <audio className={styles.audioPlayer} controls src={audioUrl}></audio>
      )}

      <div className={styles.actionsRow}>
        <button onClick={downloadAudio} disabled={!audioUrl} className={styles.actionBtn}>🎧 Scarica registrazione</button>
        {item.transcript && (
          <button onClick={downloadTranscript} className={styles.actionBtn}>📄 Scarica trascrizione</button>
        )}
        <button onClick={downloadFeedback} className={styles.actionBtn}>📥 Scarica report</button>
        {onDelete && item.id && (
          <button onClick={() => onDelete(item.id!, item.file_path)} className={styles.deleteBtn}>🗑️ Elimina</button>
        )}
      </div>
    </div>
  );
}
```

Save as `src/components/AnalysisCard.tsx`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual review checklist**

Confirm by reading the file: (a) the transcript download button only renders when `item.transcript` is truthy, matching the spec's "hide, don't show empty file" requirement, (b) the audio player only renders once `audioUrl` resolves (no broken `<audio>` tag with an empty `src` while loading), (c) the delete button requires both `onDelete` and `item.id`.

- [ ] **Step 5: Commit**

```bash
git add src/components/AnalysisCard.tsx src/components/AnalysisCard.module.css
git commit -m "feat: add shared AnalysisCard with playback, transcript and notes"
```

---

## Task 9: `ArchiveView` component

**Files:**
- Create: `src/components/ArchiveView.tsx`
- Create: `src/components/ArchiveView.module.css`

**Interfaces:**
- Consumes: `AnalysisItem` type and `AnalysisCard` default export (Task 8).
- Produces: default export `ArchiveView`, props type `ArchiveViewProps { data: AnalysisItem[]; isLoading: boolean; onBack: () => void; onDelete: (id: string, filePath: string) => void }`. Consumed by `page.tsx` (Task 10).

- [ ] **Step 1: Write the CSS module**

Moved from the current `src/app/page.module.css` (`.container`, `.header`, `.title`, `.backBtn`, `.archiveContainer`).

```css
.container {
  display: flex;
  flex-direction: column;
  flex: 1;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
  padding: 2rem;
  align-items: center;
  justify-content: center;
}

.header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 1.5rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
}

.backBtn {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  color: var(--primary);
  font-weight: 500;
}

.archiveContainer {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  margin-top: 4rem;
  padding-bottom: 2rem;
}
```

Save as `src/components/ArchiveView.module.css`.

- [ ] **Step 2: Write the component**

```tsx
"use client";

import styles from "./ArchiveView.module.css";
import AnalysisCard, { AnalysisItem } from "./AnalysisCard";

export interface ArchiveViewProps {
  data: AnalysisItem[];
  isLoading: boolean;
  onBack: () => void;
  onDelete: (id: string, filePath: string) => void;
}

export default function ArchiveView({ data, isLoading, onBack, onDelete }: ArchiveViewProps) {
  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>← Indietro</button>
        <h1 className={styles.title}>Archivio Analisi</h1>
        <div style={{ width: 30 }}></div>
      </header>
      <div className={styles.archiveContainer}>
        {isLoading ? (
          <p>Caricamento in corso...</p>
        ) : data.length === 0 ? (
          <p>Nessuna analisi salvata.</p>
        ) : (
          data.map((item) => (
            <AnalysisCard key={item.id} item={item} onDelete={onDelete} />
          ))
        )}
      </div>
    </main>
  );
}
```

Save as `src/components/ArchiveView.tsx`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ArchiveView.tsx src/components/ArchiveView.module.css
git commit -m "feat: add ArchiveView component using shared AnalysisCard"
```

---

## Task 10: Rewrite `page.tsx` as the orchestrator

**Files:**
- Modify (full replacement): `src/app/page.tsx`
- Modify (full replacement): `src/app/page.module.css`

**Interfaces:**
- Consumes: `useRecorder` (Task 4), `NotesInput` (Task 5), `RecordingView` (Task 7), `ArchiveView` (Task 9), `AnalysisCard`/`AnalysisItem` (Task 8), `supabase` (existing `src/lib/supabase.ts`).
- Produces: the page's default export `Home` (Next.js route component, no other consumers).

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase";
import { useRecorder } from "@/hooks/useRecorder";
import NotesInput from "@/components/NotesInput";
import RecordingView from "@/components/RecordingView";
import ArchiveView from "@/components/ArchiveView";
import AnalysisCard, { AnalysisItem } from "@/components/AnalysisCard";

export default function Home() {
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisItem | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveData, setArchiveData] = useState<AnalysisItem[]>([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);

  const handleUpload = async (audioBlob: Blob) => {
    if (!supabase) {
      alert("Supabase non configurato. Aggiungi le variabili in .env.local");
      return;
    }

    setIsUploading(true);
    try {
      let ext = 'webm';
      if (audioBlob.type.includes('mp4')) ext = 'mp4';
      else if (audioBlob.type.includes('wav')) ext = 'wav';
      else if (audioBlob.type.includes('ogg')) ext = 'ogg';

      const fileName = `rec_${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;

      const { data, error } = await supabase.storage
        .from("recordings")
        .upload(fileName, audioBlob, { contentType: audioBlob.type || `audio/${ext}` });

      if (error) throw error;

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: data.path, contextNotes: notes }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      setAnalysisResult({
        file_path: data.path,
        feedback: result.feedback,
        score: result.score,
        transcript: result.transcript || null,
        context_notes: notes || null,
      });
      setNotes("");
    } catch (err: any) {
      console.error("Upload/Analysis error", err);
      alert("Errore durante l'elaborazione: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const recorder = useRecorder(handleUpload);

  const handleStartRecording = () => {
    setAnalysisResult(null);
    recorder.startRecording();
  };

  const deleteAnalysis = async (id: string, filePath: string) => {
    if (!supabase) return;
    if (!confirm("Sei sicuro di voler eliminare definitivamente questa trattativa?")) return;

    const { error: dbError } = await supabase.from('analyses').delete().eq('id', id);
    if (dbError) {
      alert("Errore durante l'eliminazione dal DB: " + dbError.message);
      return;
    }

    await supabase.storage.from('recordings').remove([filePath]);
    setArchiveData(prev => prev.filter(a => a.id !== id));
  };

  const loadArchive = async () => {
    if (!supabase) return;
    setIsLoadingArchive(true);
    try {
      const { data, error } = await supabase
        .from("analyses")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setArchiveData(data || []);
      setShowArchive(true);
    } catch (err: any) {
      console.error("Error loading archive", err);
      alert("Errore caricamento archivio: " + err.message);
    } finally {
      setIsLoadingArchive(false);
    }
  };

  if (showArchive) {
    return (
      <ArchiveView
        data={archiveData}
        isLoading={isLoadingArchive}
        onBack={() => setShowArchive(false)}
        onDelete={deleteAnalysis}
      />
    );
  }

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>BitAgorà Tutor</h1>
        <button className={styles.settingsBtn} onClick={loadArchive} title="Archivio Trattative">📁</button>
      </header>

      {!recorder.isRecording ? (
        <div className={styles.initialState}>
          <button
            className={styles.recordButtonMain}
            onClick={handleStartRecording}
            disabled={isUploading}
            style={{ opacity: isUploading ? 0.5 : 1 }}
          >
            <div className={styles.recordDot}></div>
          </button>
          <p className={styles.subtitle}>
            {isUploading ? "Analisi AI in corso..." : "Nuova Trattativa"}
          </p>

          {!isUploading && !analysisResult && (
            <div className={styles.notesWrapper}>
              <NotesInput value={notes} onChange={setNotes} />
            </div>
          )}

          {analysisResult && (
            <div className={styles.resultWrapper}>
              <AnalysisCard item={analysisResult} />
            </div>
          )}
        </div>
      ) : (
        <RecordingView
          recordingTime={recorder.recordingTime}
          isPaused={recorder.isPaused}
          notes={notes}
          onNotesChange={setNotes}
          onStop={recorder.stopRecording}
          onTogglePause={recorder.togglePause}
          onOpenArchive={loadArchive}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Replace `src/app/page.module.css`**

Trimmed to only what's still used directly by `page.tsx` (everything else moved to the component-level `.module.css` files in Tasks 7-9), plus two new classes: `.notesWrapper` (constrains the pre-recording notes field width) and `.resultWrapper` (spaces the just-generated result card from the button above it).

```css
.container {
  display: flex;
  flex-direction: column;
  flex: 1;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
  padding: 2rem;
  align-items: center;
  justify-content: center;
}

.header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 1.5rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
}

.settingsBtn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--foreground);
}

.initialState {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  width: 100%;
}

.recordButtonMain {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background-color: var(--foreground);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s ease;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
}

.recordButtonMain:hover {
  transform: scale(1.05);
}

.recordDot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background-color: var(--primary);
}

.subtitle {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.notesWrapper {
  width: 100%;
  max-width: 400px;
}

.resultWrapper {
  margin-top: 1rem;
  width: 100%;
  max-width: 600px;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project (this is the integration point — if any prop type mismatch exists between page.tsx and the Task 4-9 components, it surfaces here).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Full build**

Run: `npm run build`
Expected: build succeeds. This confirms the whole app (all routes, all new components) compiles together, not just individual files.

- [ ] **Step 6: Manual review checklist**

Confirm by reading the diff: (a) `setAnalysisResult(null)` still happens before every new recording starts (now in `handleStartRecording`, not inside the hook), (b) `notes` is cleared (`setNotes("")`) only after a successful analysis, so a failed upload/analysis doesn't silently wipe notes the commercial just wrote, (c) the notes field is hidden while `analysisResult` is showing (matches today's card-replaces-button-area behavior) and reappears once a new recording starts.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/app/page.module.css
git commit -m "refactor: rewrite page.tsx as a thin orchestrator over the new components"
```

---

## Task 11: Replace `memory.md` with `CLAUDE.md` / `OVERVIEW.md` / `PROGRESS.md`

**Files:**
- Create: `CLAUDE.md`
- Create: `OVERVIEW.md`
- Create: `PROGRESS.md`
- Delete: `memory.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Write `CLAUDE.md`**

```markdown
# BitAgorà AI Tutor — CLAUDE.md

App di tutoraggio AI per i commerciali BitAgorà: registra le trattative
commerciali (da smartphone in visita cliente, o da desktop su call Teams),
le confronta con `src/lib/manuale.md` (le direttive di vendita BitAgorà) e
restituisce un report con punteggio, punti di forza e aree di miglioramento.

Nessuna autenticazione: tutte le analisi sono in un unico database condiviso
tra i commerciali (limitazione nota, vedi `PROGRESS.md`).

**Questo file resta sotto le 200 righe di proposito** — è il riferimento
rapido stabile (identità, come lavorarci, stack). Per la mappa completa
file-per-file dell'architettura vedi **`OVERVIEW.md`**. Per lo stato attuale
e i prossimi passi vedi **`PROGRESS.md`**.

## Stack

- **Frontend/Backend**: Next.js 16 (App Router) + React 19, deployato su
  Vercel: https://bitagora-ai-tutor.vercel.app/
- **Storage/DB**: Supabase (bucket `recordings` per l'audio, tabella
  `analyses` per i risultati)
- **AI**: Google Gemini 2.5 Flash via `@google/genai`, tramite Google GenAI
  File API per gestire audio anche lunghi (fino a 90 minuti)
- **Registrazione audio**: `MediaRecorder` nativo del browser, webm/opus a
  24kbps (~0.18 MB/min)

## Come lavorarci

```bash
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

Richiede `.env.local` con `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (non versionato, chiedere a Daniele).

Le migrazioni SQL (`supabase_setup.sql`, `supabase_update.sql`,
`supabase_update_v2.sql`) vanno applicate manualmente da SQL Editor su
Supabase — non c'è un sistema di migrazioni automatico.

## Flusso principale

Registra → upload diretto su Supabase Storage → `/api/analyze` scarica
l'audio, lo carica su Google GenAI File API, un'unica chiamata Gemini
restituisce punteggio + feedback + trascrizione → tutto salvato in
`analyses` → mostrato nella card risultato e, in seguito, nell'Archivio.
Dettaglio completo in `OVERVIEW.md`.

## Convenzioni

- Componenti in `src/components/`, uno per responsabilità, ciascuno con il
  proprio `*.module.css` colocato (CSS Modules, non un design system
  condiviso).
- Logica di rete (Supabase, fetch a `/api/analyze`) centralizzata in
  `src/app/page.tsx`; i componenti restano presentazionali.
- Nessun test runner configurato: verifica tramite `npm run build` +
  `npm run lint` + test manuale in browser.
```

Save as `CLAUDE.md` at the repo root.

- [ ] **Step 2: Write `OVERVIEW.md`**

```markdown
# OVERVIEW — BitAgorà AI Tutor

Mappa file-per-file dell'architettura. Per il quick-reference vedi
`CLAUDE.md`; per lo stato attuale vedi `PROGRESS.md`.

## Frontend (`src/app/page.tsx` e `src/components/`)

`page.tsx` è l'orchestratore: tiene lo stato di alto livello (note di
contesto, risultato analisi corrente, vista archivio) e le uniche chiamate
di rete dell'app (upload Supabase, fetch `/api/analyze`, query/delete
Supabase per l'archivio). Compone questi pezzi:

- **`src/hooks/useRecorder.ts`**: incapsula `MediaRecorder` (avvio, pausa,
  stop, timer). Espone `{isRecording, isPaused, recordingTime,
  startRecording, togglePause, stopRecording}` e la funzione `formatTime`.
  Riceve un callback `onRecordingComplete(blob)` chiamato quando la
  registrazione termina — `page.tsx` lo usa per avviare upload+analisi.
- **`src/components/NotesInput.tsx`**: textarea controllata per le note di
  contesto, riusata sia nella schermata iniziale (prima della registrazione)
  sia dentro `NotesOverlay` (durante la registrazione).
- **`src/components/NotesOverlay.tsx`**: overlay a schermo intero richiamato
  dal bottone "Note" durante la registrazione, per annotare senza
  interrompere la call. Wrappa `NotesInput`.
- **`src/components/RecordingView.tsx`**: la vista "registrazione in corso"
  (timer, onde, controlli Termina/Pausa/Note/Archivio). Il bottone "Note"
  apre `NotesOverlay`.
- **`src/components/AnalysisCard.tsx`**: card di un singolo risultato di
  analisi (score, feedback, note di contesto in sola lettura, player audio,
  download registrazione/trascrizione/report, elimina opzionale). Usata sia
  per il risultato appena generato sia per ogni item dell'Archivio — stessa
  UI in entrambi i casi, per questo è un componente condiviso invece di due
  separati. Il player/download audio usa `src/lib/audioUrl.ts` per ottenere
  un URL firmato Supabase al volo (il bucket `recordings` resta privato).
- **`src/components/ArchiveView.tsx`**: lista delle trattative passate,
  ciascuna renderizzata con `AnalysisCard`.
- **`src/lib/audioUrl.ts`**: `getRecordingSignedUrl(filePath)` — wrapper su
  `supabase.storage.from('recordings').createSignedUrl()`, URL valido 1 ora,
  rigenerato ogni volta che una card viene mostrata (non salvato in DB).
- **`src/lib/supabase.ts`**: client Supabase (anon key), `null` se le env
  var non sono configurate (per non far crashare la build).

## Backend (`src/app/api/analyze/route.ts`)

Unico endpoint API. Riceve `{filePath, contextNotes}`:

1. Scarica l'audio da Supabase Storage.
2. Lo carica sulla Google GenAI File API (polling finché lo stato non è
   `ACTIVE`, gestisce anche `FAILED`).
3. Costruisce il prompt: istruzioni + `src/lib/manuale.md` + (se
   `contextNotes` non è vuoto) una sezione che chiede a Gemini di tenerne
   conto nella valutazione — es. non penalizzare l'assenza di una fase se il
   contesto dice che è già stata svolta prima.
4. Una singola chiamata a Gemini 2.5 Flash con `responseMimeType:
   "application/json"`, che deve restituire `{score, feedback, transcript}`.
5. Se il parsing JSON fallisce (risposta troncata o malformata), fallback:
   salva comunque il testo grezzo come `feedback`, `transcript` resta
   `null` — l'analisi non fallisce del tutto per un problema di sola
   trascrizione.
6. Salva tutto in Supabase (`analyses`: `file_path`, `feedback`, `score`,
   `context_notes`, `transcript`) e lo restituisce al frontend.

## Database (Supabase)

Tabella `public.analyses`: `id`, `created_at`, `file_path`, `feedback`,
`score`, `context_notes` (nullable), `transcript` (nullable). RLS aperta al
ruolo `anon` per insert/select/delete (nessuna autenticazione utente, vedi
`PROGRESS.md`). Bucket storage `recordings`, privato: accesso solo tramite
URL firmati generati al volo (upload/download/lettura), mai reso pubblico.

Migrazioni, da applicare manualmente in ordine su SQL Editor:
`supabase_setup.sql` → `supabase_update.sql` → `supabase_update_v2.sql`.

## Come nasce un'analisi, passo per passo

1. Il commerciale apre l'app, scrive eventuali note di contesto, preme
   "Nuova Trattativa" → `useRecorder.startRecording()`.
2. Durante la call può riaprire le note tramite il bottone "Note"
   (`NotesOverlay`) senza interrompere la registrazione.
3. "Termina" → `useRecorder` chiude il `MediaRecorder`, produce il blob, e
   chiama `onRecordingComplete` (= `handleUpload` in `page.tsx`).
4. `handleUpload` carica il blob su Supabase Storage, poi chiama
   `POST /api/analyze` con `filePath` + le note correnti.
5. Il risultato (`score`, `feedback`, `transcript`) torna al frontend,
   `page.tsx` lo unisce a `file_path` e alle note per costruire l'oggetto
   `AnalysisItem` mostrato in `AnalysisCard`.
6. In Archivio, `loadArchive()` fa una `select *` su `analyses` e passa i
   risultati (già nella forma `AnalysisItem`, colonne comprese) ad
   `ArchiveView`.
```

Save as `OVERVIEW.md` at the repo root.

- [ ] **Step 3: Write `PROGRESS.md`**

```markdown
# PROGRESS — BitAgorà AI Tutor

## Stato attuale (2026-08-24)

MVP completato a giugno 2026 (registrazione, analisi Gemini, archivio,
PWA), deployato in produzione su Vercel. In questa sessione sono state
aggiunte, tramite il flusso Superpowers (brainstorming → spec →
writing-plans), tre funzionalità ispirate a Granola:

1. Riascolto e download della registrazione audio (URL firmati Supabase).
2. Download della trascrizione integrale (generata da Gemini nella stessa
   chiamata usata per il punteggio/feedback).
3. Note di contesto inseribili prima e durante la registrazione, usate per
   calibrare l'analisi dell'AI (es. non penalizzare una discovery assente
   se il contesto dice che è già stata fatta in un incontro precedente).

Come parte di questo lavoro, `page.tsx` (prima monolitico, 328 righe) è
stato scomposto in componenti dedicati sotto `src/components/` e un hook
`useRecorder` — vedi `OVERVIEW.md` per la mappa completa.

Spec e piano di questo lavoro: `docs/superpowers/specs/2026-08-24-tutor-debrief-features-design.md`
e `docs/superpowers/plans/2026-08-24-tutor-debrief-features.md`.

**Non testato end-to-end con credenziali reali in questa sessione** (nessuna
chiave Supabase/Gemini condivisa). Verificato solo `npm run build` +
`npm run lint` + ispezione dei diff. Il test reale (registrare, verificare
trascrizione/note/player, applicare `supabase_update_v2.sql` su Supabase)
resta da fare a Daniele prima del deploy in produzione — vedi la checklist
in Task 12 del piano di implementazione.

## Prossimi passi (ereditati dal vecchio memory.md, ancora aperti)

1. **Autenticazione**: oggi tutte le analisi sono in un unico DB condiviso
   tra i commerciali. Serve login e separazione dati per agente.
2. **Filtri e ricerca** in Archivio: per data o punteggio.
3. **Rifiniture UI/UX minori**: valutare se integrare ulteriormente l'icona
   Archivio nella home ora che l'Archivio è raggiungibile sia dalla home sia
   durante la registrazione.

## Prossimi passi emersi da questo lavoro (da valutare in futuro, fuori scope ora)

- Pacchetto di download "debrief combinato" (audio + trascrizione + report
  in un unico file), scartato per ora per tenere lo scope contenuto.
- Se le trascrizioni su chiamate molto lunghe (~90 min) risultano tagliate,
  valutare di passare a una chiamata Gemini dedicata solo alla trascrizione
  (opzione già scartata in fase di spec per non raddoppiare tempo/costo).
```

Save as `PROGRESS.md` at the repo root.

- [ ] **Step 4: Remove the old file**

```bash
git rm memory.md
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md OVERVIEW.md PROGRESS.md
git commit -m "docs: replace memory.md with CLAUDE.md/OVERVIEW.md/PROGRESS.md"
```

---

## Task 12: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors across the whole project.

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: build succeeds, all routes compile.

- [ ] **Step 4: Write the manual end-to-end checklist for the user**

No real Supabase/Gemini credentials were available during implementation, so the following must be verified manually by Daniele (in `.env.local` locally, or on a Vercel preview deployment) before this goes to production:

- [ ] Run the migration: paste `supabase_update_v2.sql` into the Supabase SQL Editor and execute it.
- [ ] Start a recording, type something in "Contesto per l'AI Tutor" before pressing the record button, verify it's still there if you stop and immediately look — then actually start recording.
- [ ] While recording, tap "Note", verify the overlay opens without pausing/stopping the recording, add a second note, tap "Fatto", verify the overlay closes and the timer kept counting.
- [ ] Stop the recording, wait for analysis, verify the result card shows: score, feedback, the context notes you wrote (read-only), an audio player that actually plays, a "Scarica registrazione" button, a "Scarica trascrizione" button, and a "Scarica report" button.
- [ ] Download each of the three files and open them — audio plays, transcript `.txt` has readable text with Cliente/Commerciale labels, report `.md` matches what's on screen.
- [ ] Open the Archive, verify the same trattativa appears with the same data (score, notes, player, three downloads) plus a working "Elimina" button.
- [ ] Record a second trattativa with no context notes at all, verify the notes box is simply absent from its card (not shown empty) and the flow still completes normally.
- [ ] On a slow mobile connection, verify the audio player doesn't break the rest of the card while the signed URL is still loading (it should just be absent until ready, per Task 8's design).

This checklist doesn't get checked off by the implementing agent — it's the handoff artifact for Daniele's own manual test pass.

- [ ] **Step 5: Commit** (only if Step 4 required file changes, e.g. checking off items in this very plan file)

```bash
git add docs/superpowers/plans/2026-08-24-tutor-debrief-features.md
git commit -m "docs: mark implementation plan tasks complete"
```
