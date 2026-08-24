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
