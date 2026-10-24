import mysql, { type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { env } from '../../config/env.js';

export const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: true,
  supportBigNumbers: true,
  decimalNumbers: true,
  namedPlaceholders: false,
  multipleStatements: false,
});

export type Db = Pick<PoolConnection, 'query' | 'execute'>;
export type Row = RowDataPacket;

export async function query<T extends Row[]>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T> {
  const [rows] = await db.query<T>(sql, params);
  return rows;
}

export async function one<T extends Row[]>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T[number] | undefined> {
  return (await query<T>(sql, params, db))[0];
}

export async function execute(sql: string, params: unknown[] = [], db: Db = pool): Promise<ResultSetHeader> {
  const [result] = await db.query<ResultSetHeader>(sql, params);
  return result;
}

export async function withTransaction<T>(work: (tx: PoolConnection) => Promise<T>): Promise<T> {
  const tx = await pool.getConnection();
  try {
    await tx.query("SET SESSION time_zone = '+00:00'");
    await tx.beginTransaction();
    const result = await work(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
