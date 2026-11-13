import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { readPlan, NO_LIMITS } from '../plans';

// The account's plan (Free or Premium) from the server's my_plan() (the 20261112 migration). App.js keeps it fresh
// with usePlanLoader; screens read it with usePlan(). Until it's known, or where it can't be (offline, signed out,
// not set up), there are no limits: the server enforces them anyway.
let current = NO_LIMITS;
const listeners = new Set();
const set = (p) => {
  current = p;
  listeners.forEach((f) => f());
};
const subscribe = (f) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
export const usePlan = () => useSyncExternalStore(subscribe, () => current, () => current);
// the plan as known right now (outside a component, e.g. while waiting for a purchase to reach the server)
export const planNow = () => current;

let refresh = null;
// after a purchase or a restore: look again now
export const refreshPlan = () => (refresh ? refresh() : Promise.resolve());

export function usePlanLoader({ enabled, userId }) {
  useEffect(() => {
    if (!enabled || !userId) {
      set(NO_LIMITS);
      return undefined;
    }
    let alive = true;
    const load = async () => {
      try {
        const { data, error } = await supabase.rpc('my_plan');
        if (alive && !error) set(readPlan(data));
      } catch {
        // offline: keep what's known
      }
    };
    refresh = load;
    load();
    const app = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => {
      alive = false;
      refresh = null;
      app.remove();
    };
  }, [enabled, userId]);
}
