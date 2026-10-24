import type { Context } from 'hono';
import type { CurrentUserDto } from '@rds/shared';

export type AppEnv = {
  Variables: {
    requestId: string;
    user: CurrentUserDto;
    sessionId: string;
  };
};
export type AppContext = Context<AppEnv>;
