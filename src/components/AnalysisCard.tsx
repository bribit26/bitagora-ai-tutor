"use client";

import { useEffect, useState } from "react";
import styles from "./AnalysisCard.module.css";
import { getRecordingSignedUrl } from "@/lib/audioUrl";

export interface AnalysisItem {
  id?: string;
  created_at?: string;
  file_path: string;
  feedback: string | null;
  score: number | null;
  context_notes?: string | null;
  transcript?: string | null;
  // Assente sulle righe create prima dei nuovi tentativi automatici = "done"
  status?: 'pending' | 'processing' | 'done' | 'failed';
  attempts?: number;
}

export interface AnalysisCardProps {
  item: AnalysisItem;
  onDelete?: (id: string, filePath: string) => void;
  onRetry?: (id: string) => void;
  isRetrying?: boolean;
}

function statusMessage(item: AnalysisItem, isRetrying?: boolean) {
  if (isRetrying || item.status === 'processing') {
    return "⏳ Analisi AI in corso...";
  }
  if (item.status === 'pending') {
    const attempts = item.attempts ? ` Tentativi finora: ${item.attempts}.` : '';
    return `⏳ Analisi non ancora completata (i modelli AI potrebbero essere sovraccarichi). La registrazione è salvata: l'analisi viene ritentata automaticamente ogni 10 minuti per 24 ore.${attempts}`;
  }
  return "⚠️ Analisi non riuscita dopo 24 ore di tentativi automatici. La registrazione è salvata: puoi riprovare manualmente.";
}

function getScoreColor(score: number | null) {
  if (!score) return '#ccc';
  if (score >= 80) return '#4caf50';
  if (score >= 50) return '#ffeb3b';
  return '#f44336';
}

export default function AnalysisCard({ item, onDelete, onRetry, isRetrying }: AnalysisCardProps) {
  const isDone = !item.status || item.status === 'done';
  const canRetry = !!onRetry && !!item.id && !isRetrying && (item.status === 'pending' || item.status === 'failed');

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const filename = item.file_path.split('/').pop() || 'registrazione';
    getRecordingSignedUrl(item.file_path).then((url) => {
      if (!cancelled) setAudioUrl(url);
    });
    getRecordingSignedUrl(item.file_path, filename).then((url) => {
      if (!cancelled) setDownloadUrl(url);
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
    if (!item.feedback) return;
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
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
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

      {isDone && item.feedback ? (
        <div className={styles.markdownContent} dangerouslySetInnerHTML={{ __html: item.feedback.replace(/\n/g, '<br/>') }}></div>
      ) : !isDone ? (
        <div className={styles.statusBox}>
          <p>{statusMessage(item, isRetrying)}</p>
          {canRetry && (
            <button onClick={() => onRetry!(item.id!)} className={styles.actionBtn}>🔄 Riprova ora</button>
          )}
        </div>
      ) : null}

      {audioUrl && (
        <audio className={styles.audioPlayer} controls src={audioUrl}></audio>
      )}

      <div className={styles.actionsRow}>
        <button onClick={downloadAudio} disabled={!downloadUrl} className={styles.actionBtn}>🎧 Scarica registrazione</button>
        {item.transcript && (
          <button onClick={downloadTranscript} className={styles.actionBtn}>📄 Scarica trascrizione</button>
        )}
        {isDone && item.feedback && (
          <button onClick={downloadFeedback} className={styles.actionBtn}>📥 Scarica report</button>
        )}
        {onDelete && item.id && (
          <button onClick={() => onDelete(item.id!, item.file_path)} className={styles.deleteBtn}>🗑️ Elimina</button>
        )}
      </div>
    </div>
  );
}
