"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
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
      
      const RecordRTC = (await import('recordrtc')).default;
      const { StereoAudioRecorder } = await import('recordrtc');
      
      const recorder = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        recorderType: StereoAudioRecorder,
        numberOfAudioChannels: 1, // Mono
        desiredSampRate: 8000, // 8kHz (qualità telefono) per dimezzare ulteriormente il peso
      });
      
      mediaRecorderRef.current = recorder;
      recorder.startRecording();

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
      const state = mediaRecorderRef.current.getState();
      if (state === "recording") {
        mediaRecorderRef.current.pauseRecording();
        setIsPaused(true);
      } else if (state === "paused") {
        mediaRecorderRef.current.resumeRecording();
        setIsPaused(false);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stopRecording(async () => {
        const audioBlob = mediaRecorderRef.current.getBlob();
        setIsRecording(false);
        setIsPaused(false);
        
        await handleUpload(audioBlob);
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      });
    }
  };

  const handleUpload = async (audioBlob: Blob) => {
    if (!supabase) {
      alert("Supabase non configurato. Aggiungi le variabili in .env.local");
      return;
    }
    
    setIsUploading(true);
    try {
      const fileName = `rec_${new Date().toISOString().replace(/[:.]/g, "-")}.wav`;
      
      const { data, error } = await supabase.storage
        .from("recordings")
        .upload(fileName, audioBlob, { contentType: "audio/wav" });

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
      
      setAnalysisResult(result.feedback);
      
    } catch (err: any) {
      console.error("Upload/Analysis error", err);
      alert("Errore durante l'elaborazione: " + err.message);
    } finally {
      setIsUploading(false);
    }
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
                <p className={styles.archiveDate}>{new Date(item.created_at).toLocaleString('it-IT')}</p>
                <div className={styles.markdownContent} dangerouslySetInnerHTML={{ __html: item.feedback.replace(/\n/g, '<br/>') }}></div>
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
        <button className={styles.settingsBtn}>⚙️</button>
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
              <h3>Feedback dell'AI Tutor</h3>
              <div className={styles.markdownContent} dangerouslySetInnerHTML={{ __html: analysisResult.replace(/\n/g, '<br/>') }}></div>
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
