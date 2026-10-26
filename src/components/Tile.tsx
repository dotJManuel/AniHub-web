import type { ListItem, MediaType, ServiceId } from '../types';

export const siteName = (s: ServiceId) => (s === 'mal' ? 'MyAnimeList' : 'AniList');
const siteBase = (s: ServiceId) => (s === 'mal' ? 'https://myanimelist.net' : 'https://anilist.co');

// Episodios de atraso para un anime en emisión (0 si al día o no aplica).
export function behindCount(it: ListItem): number {
  return it.airingEp != null && it.airingEp > it.progress ? it.airingEp - it.progress : 0;
}

interface Props {
  item: ListItem;
  type: MediaType;
  busy: boolean;
  onOpen: () => void;
  onStep: (delta: 1 | -1) => void;
}

// Tile tipo póster: portada de fondo, info superpuesta sobre un degradado.
export default function Tile({ item, type, busy, onOpen, onStep }: Props) {
  const b = behindCount(item);
  return (
    <div className={`tile${b ? ' is-behind' : ''}`} onClick={onOpen} title="View details">
      {item.image && (
        <img
          className="tile-img"
          src={item.image}
          alt=""
          loading="lazy"
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
        />
      )}
      <div className="tile-top">
        <div className="tile-top-row">
          <a
            className="tile-open"
            href={`${siteBase(item.provider)}/${type}/${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open on ${siteName(item.provider)}`}
            aria-label={`Open on ${siteName(item.provider)}`}
            onClick={(e) => e.stopPropagation()}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17 17 7" />
              <path d="M8 7h9v9" />
            </svg>
          </a>
          {item.score > 0 && <span className="tile-chip tile-score">★ {item.score}</span>}
        </div>
        {b > 0 && <span className="tile-chip behind-chip" title="Episodes behind">⏳ {b}</span>}
      </div>
      <div className="tile-bottom">
        <div className="tile-title">{item.title}</div>
        <div className="tile-row">
          <span className="tile-progress">
            <b>{item.progress}</b> {item.total ? `/ ${item.total}` : ''}
          </span>
          <div className="tile-steps">
            <button
              disabled={busy}
              title="Remove 1"
              onClick={(e) => {
                e.stopPropagation();
                onStep(-1);
              }}
            >
              −
            </button>
            <button
              disabled={busy}
              title="Add 1"
              onClick={(e) => {
                e.stopPropagation();
                onStep(1);
              }}
            >
              +1
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
