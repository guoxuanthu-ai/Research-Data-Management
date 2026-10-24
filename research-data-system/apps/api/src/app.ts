import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { requestContext } from './http/middlewares/requestContext.js';
import { ApiError, isDuplicate } from './http/errors.js';
import { issues } from './http/validate.js';
import { ok } from './http/responders.js';
import { one, type Row } from './infrastructure/db/client.js';
import { authRoutes } from './http/routes/authRoutes.js';
import { userRoutes } from './http/routes/userRoutes.js';
import { processRoutes } from './http/routes/processRoutes.js';
import { subjectRoutes } from './http/routes/subjectRoutes.js';
import { templateRoutes } from './http/routes/templateRoutes.js';
import { recordRoutes } from './http/routes/recordRoutes.js';
import { lifecycleRoutes } from './http/routes/lifecycleRoutes.js';
import { draftRoutes } from './http/routes/draftRoutes.js';
import { importExportRoutes } from './http/routes/importExportRoutes.js';
import { dashboardRoutes } from './http/routes/dashboardRoutes.js';
import { auditRoutes } from './http/routes/auditRoutes.js';
import type { AppEnv } from './http/types.js';

export const app = new Hono<AppEnv>();
app.use('*', requestContext);
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  await next();
});

app.get('/api/v1/health', async (c) => {
  await one<Row[]>('SELECT 1 AS healthy');
  return ok(c, { status: 'ok' });
});
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/users', userRoutes);
app.route('/api/v1/process-defs', processRoutes);
app.route('/api/v1', importExportRoutes);
app.route('/api/v1', subjectRoutes);
app.route('/api/v1/templates', templateRoutes);
app.route('/api/v1/records', recordRoutes);
app.route('/api/v1/lifecycle-records', lifecycleRoutes);
app.route('/api/v1/drafts', draftRoutes);
app.route('/api/v1/dashboard', dashboardRoutes);
app.route('/api/v1/audit-logs', auditRoutes);

app.notFound((c) => c.json({ ok: false as const, error: { code: 'NOT_FOUND', message: '接口不存在' }, requestId: c.get('requestId') }, 404));
app.onError((error, c) => {
  let status: ContentfulStatusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = '系统繁忙，请稍后重试';
  let details;
  if (error instanceof ApiError) {
    status = error.status; code = error.code; message = error.message; details = error.details;
  } else if (error instanceof ZodError) {
    status = 400; code = 'VALIDATION_ERROR'; message = '请求参数不合法'; details = issues(error);
  } else if (isDuplicate(error)) {
    status = 409; code = 'CONFLICT'; message = '数据已存在，请勿重复提交';
  }
  if (status >= 500) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', requestId: c.get('requestId'),
      message: error.message, stack: error.stack }));
  }
  return c.json({ ok: false as const, error: { code, message, ...(details ? { details } : {}) }, requestId: c.get('requestId') }, status);
});
