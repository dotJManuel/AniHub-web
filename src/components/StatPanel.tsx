export interface StatCell {
  k: string;
  v: string;
  accent?: boolean;
}

// Panel de estadísticas: celdas separadas por líneas finas de 1px.
export default function StatPanel({ cells, cols }: { cells: StatCell[]; cols?: number }) {
  if (!cells.length) return null;
  return (
    <div
      className={`stat-panel${cols ? '' : ' auto'}`}
      style={cols ? ({ ['--cols' as string]: cols } as React.CSSProperties) : undefined}
    >
      {cells.map((c) => (
        <div className="stat" key={c.k}>
          <span className="lbl">{c.k}</span>
          <span className={`val${c.accent ? ' ac' : ''}`}>{c.v}</span>
        </div>
      ))}
    </div>
  );
}
