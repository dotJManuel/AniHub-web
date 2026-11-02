export interface SegOption<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

interface Props<T extends string> {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}

// Control segmentado (MyAnimeList | AniList, Tema, Escala…).
export default function Segmented<T extends string>({ value, options, onChange, label, className = '' }: Props<T>) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`seg${o.id === value ? ' on' : ''}`}
          aria-pressed={o.id === value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
