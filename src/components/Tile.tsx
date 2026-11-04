import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../hooks';
import { behindOf, displayScore, fmtNum, initials, shortCountdown } from '../lib/format';
import type { ListItem, MediaType, ScaleSetting } from '../types';
import { IconStar } from './Icons';

export const siteName = (s: 'mal' | 'anilist') => (s === 'mal' ? 'MyAnimeList' : 'AniList');

function hue(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360;
  return h;
}

interface Props {
  item: ListItem;
  type: MediaType;
  scale: ScaleSetting;
  busy: boolean;
  // Solo en la lista "viendo": en otros estados no hay botones −/+1.
  onStep?: (delta: 1 | -1) => void;
}

// Tarjeta de lista: portada 2:3 a sangre completa; título, progreso y −/+1 encima.
export default function Tile({ item, type, scale, busy, onStep }: Props) {
  const t = useT();
  const [broken, setBroken] = useState(false);
  const h = hue(item.title);
  const pct = item.total ? Math.min(100, Math.round((item.progress / item.total) * 100)) : null;
  const unit = type === 'anime' ? 'EP' : 'CH';
  const showImg = !!item.image && !broken;
  const behind = type === 'anime' ? behindOf(item) : 0;

  return (
    <article className="card">
      <Link
        className="cover"
        to={`/detail/${item.provider}/${type}/${item.id}`}
        aria-label={t('card.view', { title: item.title })}
        style={{ background: `linear-gradient(160deg, oklch(0.52 0.13 ${h}), oklch(0.28 0.08 ${h}))` }}
      >
        {showImg ? (
          <img className="cover-img" src={item.image} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <>
            <span className="hatch" />
            <span className="initials">{initials(item.title)}</span>
          </>
        )}
        {item.score > 0 && (
          <span className="badge score">
            <IconStar />
            {displayScore(item.score, item.provider, scale)}
          </span>
        )}
        {!item.next && item.nextAt && type === 'anime' && (
          <span className="badge next">~ {shortCountdown({ episode: 0, at: item.nextAt })}</span>
        )}
        {item.next && type === 'anime' && (
          <span className="badge next">
            EP {item.next.episode} · {shortCountdown(item.next)}
          </span>
        )}
      </Link>
      <span className="scrim" />
      <div className="overlay">
        {behind > 0 && <span className="behind">BEHIND {fmtNum(behind)}</span>}
        <h3 className="title2">{item.title}</h3>
        <div className="prog">
          <div className="prog-row">
            <span>
              <b>
                <span className="unit">{unit}</span> {item.total ? `${fmtNum(item.progress)} / ${fmtNum(item.total)}` : fmtNum(item.progress)}
              </b>
            </span>
            <span className="pct">{pct === null ? t('card.ongoing') : `${pct}%`}</span>
          </div>
          <div className="bar">
            <i style={{ width: pct === null ? '100%' : `${pct}%` }} />
          </div>
        </div>
        {onStep && (<div className="steps">
          <button className="step" disabled={busy} onClick={() => onStep(-1)} aria-label={t('card.minus')}>
            −
          </button>
          <button className="step plus" disabled={busy} onClick={() => onStep(1)} aria-label={t('card.plus')}>
            +1
          </button>
        </div>)}
      </div>
    </article>
  );
}
