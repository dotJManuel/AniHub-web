import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import * as auth from './lib/auth';
import * as storage from './lib/storage';
import { applyTheme, resolveTheme } from './lib/theme';
import type { ScaleSetting, ServiceId, ThemePref } from './types';

// Estado de conexión reactivo: se actualiza al conectar/desconectar una cuenta.
export function useAuthStatus() {
  const key = useSyncExternalStore(
    storage.subscribe,
    () => {
      const s = auth.status();
      return `${s.anilist ? 1 : 0}${s.mal ? 1 : 0}`;
    },
    () => '00',
  );
  return { anilist: key[0] === '1', mal: key[1] === '1' };
}

export type ToastFn = (msg: string, isErr?: boolean) => void;
export const ToastContext = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastContext);

// Preferencia persistente simple (pestaña activa, tipo activo, escala…).
export function usePref(key: string, fallback: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(
    storage.subscribe,
    () => storage.getPref(key) ?? fallback,
    () => fallback,
  );
  const set = useCallback(
    (v: string) => {
      storage.setPref(key, v);
      window.dispatchEvent(new Event('anihub:storage'));
    },
    [key],
  );
  return [value, set];
}

// --- Tema ------------------------------------------------------------------

// Se monta una sola vez en <App>: aplica data-theme y sigue al sistema si es "Sistema".
export function useApplyTheme() {
  const [pref] = usePref('theme', 'system');
  useEffect(() => {
    applyTheme(pref as ThemePref);
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);
}

export function useTheme() {
  const [pref, setPref] = usePref('theme', 'system');
  // El tema resuelto depende del sistema solo si pref === 'system'.
  const [, force] = useState(0);
  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => force((n) => n + 1);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);
  const resolved = resolveTheme(pref as ThemePref);
  return {
    pref: pref as ThemePref,
    resolved,
    setPref: (v: ThemePref) => setPref(v),
    // El botón sol/luna alterna claro <-> oscuro de forma explícita.
    toggle: () => setPref(resolved === 'dark' ? 'light' : 'dark'),
  };
}

// --- Otros ajustes ------------------------------------------------------------

export const useScale = () => {
  const [v, set] = usePref('scale', 'orig');
  return [v as ScaleSetting, set as (v: ScaleSetting) => void] as const;
};

// Fuente (servicio) activa en la lista. Si nunca se eligió, la primera conectada.
export function useSource(): [ServiceId, (s: ServiceId) => void] {
  const status = useAuthStatus();
  const [v, set] = usePref('activeTab', status.mal || !status.anilist ? 'mal' : 'anilist');
  const pref = v as ServiceId;
  // Si la fuente guardada no está conectada, se usa la que sí lo está.
  const source: ServiceId = status[pref] ? pref : status.mal ? 'mal' : status.anilist ? 'anilist' : pref;
  return [source, set as (s: ServiceId) => void];
}

// Valor con retraso (para no consultar la API en cada tecla).
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}
