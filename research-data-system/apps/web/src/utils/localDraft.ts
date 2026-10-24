export function readLocalDraft<T>(key: string): { payload: T; updatedAt: string } | null {
  try { const raw = localStorage.getItem(`rds:draft:${key}`); return raw ? JSON.parse(raw) as { payload: T; updatedAt: string } : null; }
  catch { return null; }
}
export function writeLocalDraft<T>(key: string, payload: T) { try { localStorage.setItem(`rds:draft:${key}`, JSON.stringify({ payload, updatedAt: new Date().toISOString() })); } catch { /* local storage can be unavailable in private mode */ } }
export function clearLocalDraft(key: string) { try { localStorage.removeItem(`rds:draft:${key}`); } catch { /* ignore storage errors */ } }
