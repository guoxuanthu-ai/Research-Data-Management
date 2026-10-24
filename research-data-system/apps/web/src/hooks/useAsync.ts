import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync<T>(loader: () => Promise<T>, dependencies: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await loaderRef.current()); }
    catch (cause) { setError(cause instanceof Error ? cause : new Error('加载失败')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload, ...dependencies]);
  return { data, loading, error, reload, setData };
}
