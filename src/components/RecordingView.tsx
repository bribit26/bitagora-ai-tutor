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
