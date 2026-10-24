import { z } from 'zod';
import type { ValidationIssue } from '@rds/shared';
import type { AppContext } from './types.js';
import { badRequest } from './errors.js';

export function issues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    code: issue.code,
    message: issue.message,
    severity: 'error',
  }));
}

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw badRequest('请求参数不合法', issues(result.error));
  return result.data;
}

export async function body<T>(c: AppContext, schema: z.ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    throw badRequest('请求体必须是合法 JSON');
  }
  return parse(schema, input);
}

export function query<T>(c: AppContext, schema: z.ZodType<T>): T {
  return parse(schema, c.req.query());
}

export function versionFromRequest(c: AppContext, input?: unknown): number {
  if (input && typeof input === 'object' && 'version' in input) {
    return parse(zNumberVersion, input);
  }
  return parse(zNumberVersion, { version: c.req.query('version') });
}

const zNumberVersion = z.object({ version: z.coerce.number().int().positive() }).transform((value) => value.version);
