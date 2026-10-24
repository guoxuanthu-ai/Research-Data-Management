import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CurrentUserDto } from '@rds/shared';
import { authApi } from '../api';
import { refreshSession, setAccessToken, setUnauthorizedHandler } from '../api/client';
import { Loading } from '../components/ui/Feedback';
interface AuthValue { user: CurrentUserDto | null; loading: boolean; login: (username: string, password: string) => Promise<void>; logout: () => Promise<void>; changePassword: (oldPassword: string, newPassword: string) => Promise<void>; }
const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUserDto | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setUnauthorizedHandler(() => setUser(null));
    refreshSession().then((session) => { if (active) setUser(session.user); }).catch(() => { if (active) setUser(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const login = useCallback(async (username: string, password: string) => { const session = await authApi.login(username, password); setAccessToken(session.accessToken); setUser(session.user); }, []);
  const logout = useCallback(async () => { try { await authApi.logout(); } finally { setAccessToken(null); setUser(null); } }, []);
  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    if (!user) throw new Error('登录状态已失效');
    await authApi.changePassword(oldPassword, newPassword);
    const session = await authApi.login(user.username, newPassword);
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, [user]);
  const value = useMemo(() => ({ user, loading, login, logout, changePassword }), [user, loading, login, logout, changePassword]);
  return <AuthContext.Provider value={value}>{loading ? <div className="flex min-h-screen items-center justify-center"><div className="w-64"><Loading rows={2} /><p className="text-center text-sm text-ink-400">正在恢复登录状态…</p></div></div> : children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
