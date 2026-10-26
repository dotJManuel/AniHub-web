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
        <a
          className="tile-open"
          href={`${siteBase(item.provider)}/${type}/${item.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open on ${siteName(item.provider)}`}
          onClick={(e) => e.stopPropagation()}
        >
          ↗
        </a>
        {b > 0 && <span className="tile-chip behind-chip" title="Episodes behind">⏳ {b}</span>}
        {item.score > 0 && <span className="tile-chip tile-score">★ {item.score}</span>}
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
