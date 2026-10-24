import type { ApiEnvelope, ApiErrorEnvelope, AuthSessionDto } from '@rds/shared';
import { createId } from '../utils/id';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string, public requestId?: string) { super(message); }
}

let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
let refreshPromise: Promise<AuthSessionDto> | null = null;

export function setAccessToken(token: string | null) { accessToken = token; }
export function getAccessToken() { return accessToken; }
export function setUnauthorizedHandler(handler: () => void) { unauthorizedHandler = handler; }

async function parseResponse(response: Response): Promise<unknown> {
  const type = response.headers.get('content-type') ?? '';
  return type.includes('application/json') ? response.json() : response.text();
}

export async function refreshSession(): Promise<AuthSessionDto> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(async (response) => {
        const body = await parseResponse(response) as ApiEnvelope<AuthSessionDto> | ApiErrorEnvelope;
        if (!response.ok || !body || typeof body !== 'object' || !('ok' in body) || !body.ok) throw new ApiError('登录已失效', response.status, 'UNAUTHORIZED');
        accessToken = body.data.accessToken;
        return body.data;
      }).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  retry?: boolean;
  timeout?: number;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, retry = true, timeout = 20000, headers: customHeaders, ...init } = options;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  const headers = new Headers(customHeaders);
  headers.set('X-Request-Id', createId());
  if (body !== undefined && !(body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  try {
    const response = await fetch(`/api/v1${path}`, {
      ...init, headers, credentials: 'include', signal: controller.signal,
      body: body === undefined ? null : body instanceof FormData ? body : JSON.stringify(body),
    });
    if (response.status === 401 && retry && path !== '/auth/login' && path !== '/auth/refresh') {
      try { await refreshSession(); }
      catch { accessToken = null; unauthorizedHandler?.(); throw new ApiError('登录已过期，请重新登录', 401, 'UNAUTHORIZED'); }
      return api<T>(path, { ...options, retry: false });
    }
    const payload = await parseResponse(response);
    if (!response.ok) {
      const error = payload as ApiErrorEnvelope;
      throw new ApiError(error?.error?.message ?? `请求失败（${response.status}）`, response.status, error?.error?.code ?? 'REQUEST_FAILED', error?.requestId);
    }
    if (response.status === 204) return undefined as T;
    if (payload && typeof payload === 'object' && 'ok' in payload) {
      if ((payload as ApiEnvelope<T>).ok) return (payload as ApiEnvelope<T>).data;
      const error = payload as ApiErrorEnvelope;
      throw new ApiError(error.error.message, response.status, error.error.code, error.requestId);
    }
    return payload as T;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw new ApiError('请求超时，请检查网络后重试', 408, 'TIMEOUT');
    throw cause;
  } finally { window.clearTimeout(timer); }
}

export async function downloadFile(path: string): Promise<void> {
  const headers = new Headers({ 'X-Request-Id': createId() });
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let response = await fetch(`/api/v1${path}`, { headers, credentials: 'include' });
  if (response.status === 401) { await refreshSession(); return downloadFile(path); }
  if (!response.ok) {
    const payload = await parseResponse(response) as ApiErrorEnvelope;
    throw new ApiError(payload?.error?.message ?? '导出失败', response.status, payload?.error?.code ?? 'DOWNLOAD_FAILED');
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const name = encoded ? decodeURIComponent(encoded) : plain ?? '研发数据.xlsx';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
