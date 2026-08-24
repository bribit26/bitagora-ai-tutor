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
    } catch (err: unknown) {
      console.error("Upload/Analysis error", err);
      const message = err instanceof Error ? err.message : String(err);
      alert("Errore durante l'elaborazione: " + message);
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
    } catch (err: unknown) {
      console.error("Error loading archive", err);
      const message = err instanceof Error ? err.message : String(err);
      alert("Errore caricamento archivio: " + message);
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
