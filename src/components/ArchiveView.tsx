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
