import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import * as auth from './lib/auth';
import * as storage from './lib/storage';

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

// Preferencia persistente simple (pestaña activa, tipo activo).
export function usePref(key: string, fallback: string): [string, (v: string) => void] {
  const subscribe = storage.subscribe;
  const value = useSyncExternalStore(
    subscribe,
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
