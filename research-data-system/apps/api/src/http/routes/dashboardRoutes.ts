import { Hono } from 'hono';
import { requireAuth } from '../middlewares/auth.js';
import { ok } from '../responders.js';
import { one, query, type Row } from '../../infrastructure/db/client.js';
import type { AppEnv } from '../types.js';

export const dashboardRoutes = new Hono<AppEnv>();
dashboardRoutes.use('*', requireAuth);

function utcBoundary(localDate: string): string {
  return new Date(`${localDate}T00:00:00+08:00`).toISOString().slice(0, 23).replace('T', ' ');
}

dashboardRoutes.get('/summary', async (c) => {
  const shanghaiNow = new Date(Date.now() + 8 * 3600_000);
  const today = shanghaiNow.toISOString().slice(0, 10);
  const monthDate = `${today.slice(0, 7)}-01`;
  const day = shanghaiNow.getUTCDay();
  const monday = new Date(shanghaiNow.getTime() - ((day + 6) % 7) * 86400_000).toISOString().slice(0, 10);
  const monthStart = utcBoundary(monthDate);
  const weekStart = utcBoundary(monday);
  const [weekExperiments, monthExperiments, monthProducts, monthRecords, totalProducts, totalExperiments] = await Promise.all([
    one<Row[]>('SELECT COUNT(*) AS count FROM experiments WHERE deleted_at IS NULL AND experiment_date>=?', [monday]),
    one<Row[]>('SELECT COUNT(*) AS count FROM experiments WHERE deleted_at IS NULL AND experiment_date>=?', [monthDate]),
    one<Row[]>('SELECT COUNT(*) AS count FROM products WHERE deleted_at IS NULL AND created_at>=?', [monthStart]),
    one<Row[]>('SELECT COUNT(*) AS count FROM lifecycle_records WHERE deleted_at IS NULL AND created_at>=?', [monthStart]),
    one<Row[]>('SELECT COUNT(*) AS count FROM products WHERE deleted_at IS NULL'),
    one<Row[]>('SELECT COUNT(*) AS count FROM experiments WHERE deleted_at IS NULL'),
  ]);
  const days = Math.min(90, Math.max(1, Number(c.req.query('days')) || 3));
  const activities = await query<Row[]>(`SELECT a.id,a.action,a.created_at,u.display_name AS actor_name,
    COALESCE(p.name,e.name,'') AS subject_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
    LEFT JOIN products p ON a.subject_type='product' AND p.id=a.subject_id
    LEFT JOIN experiments e ON a.subject_type='experiment' AND e.id=a.subject_id
    WHERE a.entity_type='lifecycle_record' AND a.action='create' ORDER BY a.created_at DESC LIMIT 20`);
  const missingEntries = await query<Row[]>(`SELECT e.id,e.experiment_no AS code,e.name,u.display_name AS owner_name,e.experiment_date AS date,
    DATEDIFF(?,e.experiment_date) AS days_missing FROM experiments e JOIN users u ON u.id=e.owner_id
    WHERE e.deleted_at IS NULL AND e.experiment_date < DATE_SUB(?,INTERVAL ? DAY)
    AND NOT EXISTS(SELECT 1 FROM lifecycle_records l WHERE l.subject_type='experiment' AND l.subject_id=e.id AND l.deleted_at IS NULL)
    ORDER BY e.experiment_date LIMIT 50`, [today, today, days]);
  return ok(c, {
    weekExperiments: Number(weekExperiments?.count ?? 0), monthExperiments: Number(monthExperiments?.count ?? 0),
    monthProducts: Number(monthProducts?.count ?? 0), monthRecords: Number(monthRecords?.count ?? 0),
    totalProducts: Number(totalProducts?.count ?? 0), totalExperiments: Number(totalExperiments?.count ?? 0),
    activities: activities.map((row) => ({ id: String(row.id), actorName: String(row.actor_name ?? '系统'), action: String(row.action),
      subjectName: String(row.subject_name), createdAt: String(row.created_at) })),
    missingEntries: missingEntries.map((row) => ({ id: String(row.id), code: String(row.code), name: String(row.name),
      ownerName: String(row.owner_name), date: String(row.date), daysMissing: Number(row.days_missing) })),
  });
});
