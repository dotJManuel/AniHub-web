import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT, type TFn } from '../hooks';
import { displayScore, initials } from '../lib/format';
import type { ScaleSetting, SearchResult, Status } from '../types';
import { IconStar } from './Icons';

function hue(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360;
  return h;
}

// Estado en tu lista, en mayúsculas (se traduce con los mismos textos de los estados).
const listLabel = (t: TFn, r: SearchResult): Record<Status, string> => ({
  WATCHING: (r.type === 'anime' ? t('st.watching') : t('st.reading')).toUpperCase(),
  PLANNING: t('st.planning').toUpperCase(),
  COMPLETED: t('st.completed').toUpperCase(),
  PAUSED: t('st.paused').toUpperCase(),
  DROPPED: t('st.dropped').toUpperCase(),
  REPEATING: (r.type === 'anime' ? t('st.repeating') : t('st.rereading')).toUpperCase(),
});

// Resultado de búsqueda: misma tarjeta 2:3 de la lista, sin botones. Abre el detalle del mismo sitio.
export default function ResultCard({ r, scale }: { r: SearchResult; scale: ScaleSetting }) {
  const t = useT();
  const [broken, setBroken] = useState(false);
  const h = hue(r.title);
  const showImg = !!r.image && !broken;
  const unit = r.type === 'anime' ? 'EP' : 'CH';
  const meta = [r.format, r.year ? String(r.year) : '', r.total ? `${r.total} ${unit}` : ''].filter(Boolean).join(' · ');

  return (
    <article className="card">
      <Link
        className="cover"
        to={`/detail/${r.provider}/${r.type}/${r.id}`}
        aria-label={t('card.view', { title: r.title })}
        style={{ background: `linear-gradient(160deg, oklch(0.52 0.13 ${h}), oklch(0.28 0.08 ${h}))` }}
      >
        {showImg ? (
          <img className="cover-img" src={r.image} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <>
            <span className="hatch" />
            <span className="initials">{initials(r.title)}</span>
          </>
        )}
        {r.inList && <span className="badge next">{listLabel(t, r)[r.inList]}</span>}
        {r.score != null && r.score > 0 && (
          <span className="badge score">
            <IconStar />
            {displayScore(r.score, r.provider, scale)}
          </span>
        )}
      </Link>
      <span className="scrim" />
      <div className="overlay">
        <h3 className="title2">{r.title}</h3>
        {(meta || r.status) && (
          <div className="prog-row">
            <span className="pct">{meta}</span>
          </div>
        )}
      </div>
    </article>
  );
}
