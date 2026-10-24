import type { CurrentUserDto, Role } from '@rds/shared';
export const roleLabels: Record<Role, string> = { director: '厂长', supervisor: '研发主管', engineer: '工程师' };
export const canManage = (user: CurrentUserDto | null) => user?.role === 'director' || user?.role === 'supervisor';
export const canEditOwned = (user: CurrentUserDto | null, creatorId: string) => canManage(user) || user?.id === creatorId;
