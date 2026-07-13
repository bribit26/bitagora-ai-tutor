"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveData, setArchiveData] = useState<any[]>([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  
  const mediaRecorderRef = useRef<any>(null); // We'll store RecordRTC instance here
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

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
      setAnalysisResult(null);
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
        
        await handleUpload(audioBlob);
        
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

  const pauseRecording = () => {
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
      
      console.log("Uploaded successfully to Supabase:", data.path);
      
      // Call Next.js API to start Gemini analysis
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: data.path })
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      
      setAnalysisResult(result);
      
    } catch (err: any) {
      console.error("Upload/Analysis error", err);
      alert("Errore durante l'elaborazione: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const downloadAnalysis = (item: any) => {
    const blob = new Blob([item.feedback], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analisi_trattativa_${new Date(item.created_at).toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
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

  const getScoreColor = (score: number) => {
    if (!score) return '#ccc';
    if (score >= 80) return '#4caf50';
    if (score >= 50) return '#ffeb3b';
    return '#f44336';
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
      <main className={styles.container}>
        <header className={styles.header}>
          <button className={styles.backBtn} onClick={() => setShowArchive(false)}>← Indietro</button>
          <h1 className={styles.title}>Archivio Analisi</h1>
          <div style={{width: 30}}></div>
        </header>
        <div className={styles.archiveContainer}>
          {isLoadingArchive ? (
            <p>Caricamento in corso...</p>
          ) : archiveData.length === 0 ? (
            <p>Nessuna analisi salvata.</p>
          ) : (
            archiveData.map((item) => (
              <div key={item.id} className={styles.archiveCard}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                  <p className={styles.archiveDate}>{new Date(item.created_at).toLocaleString('it-IT')}</p>
                  {item.score && (
                    <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                      <div style={{width: 12, height: 12, borderRadius: '50%', backgroundColor: getScoreColor(item.score)}}></div>
                      <strong>{item.score}/100</strong>
                    </div>
                  )}
                </div>
                <div className={styles.markdownContent} dangerouslySetInnerHTML={{ __html: item.feedback.replace(/\n/g, '<br/>') }}></div>
                <div style={{display: 'flex', gap: '10px', marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '10px'}}>
                  <button onClick={() => downloadAnalysis(item)} style={{padding: '5px 15px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 5, background: 'none'}}>📥 Scarica</button>
                  <button onClick={() => deleteAnalysis(item.id, item.file_path)} style={{padding: '5px 15px', cursor: 'pointer', border: '1px solid #ff4444', color: '#ff4444', borderRadius: 5, background: 'none'}}>🗑️ Elimina</button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>BitAgorà Tutor</h1>
        <button className={styles.settingsBtn} onClick={loadArchive} title="Archivio Trattative" style={{cursor: 'pointer', fontSize: '1.2rem'}}>📁</button>
      </header>
      
      {!isRecording ? (
        <div className={styles.initialState}>
          <button 
            className={styles.recordButtonMain}
            onClick={startRecording}
            disabled={isUploading}
            style={{ opacity: isUploading ? 0.5 : 1 }}
          >
            <div className={styles.recordDot}></div>
          </button>
          <p className={styles.subtitle}>
            {isUploading ? "Analisi AI in corso..." : "Nuova Trattativa"}
          </p>

          {analysisResult && (
            <div className={styles.analysisCard}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h3>Feedback dell'AI Tutor</h3>
                {analysisResult.score && (
                  <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                    <div style={{width: 12, height: 12, borderRadius: '50%', backgroundColor: getScoreColor(analysisResult.score)}}></div>
                    <strong>{analysisResult.score}/100</strong>
                  </div>
                )}
              </div>
              <div className={styles.markdownContent} dangerouslySetInnerHTML={{ __html: (analysisResult.feedback || analysisResult).replace(/\n/g, '<br/>') }}></div>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.recordingState}>
          <h2 className={styles.timer}>{formatTime(recordingTime)}</h2>
          <p className={styles.recordingText}>
            {isPaused ? "In pausa..." : "Registrazione in corso..."}
          </p>
          
          <div className={styles.waveContainer}>
            <div className={styles.wave} style={{ opacity: isPaused ? 0.2 : 0.5 }}></div>
          </div>
          
          <div className={styles.controls}>
            <button className={styles.controlBtn} onClick={stopRecording}>
              <div className={styles.iconCircle}>
                <div className={styles.stopSquare}></div>
              </div>
              <span className={styles.controlLabel}>Termina</span>
            </button>
            <button className={styles.controlBtnPrimary} onClick={pauseRecording}>
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
            <button className={styles.controlBtn} onClick={loadArchive}>
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
        </div>
      )}
    </main>
  );
}
