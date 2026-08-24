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
