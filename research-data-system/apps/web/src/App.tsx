import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthProvider';
import { canManage } from './auth/permissions';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './features/auth/LoginPage';
import { ChangePasswordPage } from './features/auth/ChangePasswordPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SubjectListPage } from './features/subjects/SubjectListPage';
import { SubjectDetailPage } from './features/subjects/SubjectDetailPage';
import { RecordEntryPage } from './features/records/RecordEntryPage';
import { TemplateListPage } from './features/templates/TemplateListPage';
import { TemplateEditorPage } from './features/templates/TemplateEditorPage';
import { UserManagementPage } from './features/settings/UserManagementPage';
import { AuditLogPage } from './features/settings/AuditLogPage';
function Protected({ children }: { children: ReactNode }) { const { user } = useAuth(); const location = useLocation(); if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />; return children; }
function Manager({ children }: { children: ReactNode }) { const { user } = useAuth(); return canManage(user) ? children : <Navigate to="/" replace />; }
export function App() { return <Routes><Route path="/login" element={<LoginPage />} /><Route path="/change-password" element={<Protected><ChangePasswordPage /></Protected>} /><Route element={<Protected><AppShell /></Protected>}><Route index element={<DashboardPage />} /><Route path="products" element={<SubjectListPage type="product" />} /><Route path="products/:id" element={<SubjectDetailPage type="product" />} /><Route path="products/:id/entry" element={<RecordEntryPage type="product" />} /><Route path="experiments" element={<SubjectListPage type="experiment" />} /><Route path="experiments/:id" element={<SubjectDetailPage type="experiment" />} /><Route path="experiments/:id/entry" element={<RecordEntryPage type="experiment" />} /><Route path="templates" element={<Manager><TemplateListPage /></Manager>} /><Route path="templates/new" element={<Manager><TemplateEditorPage /></Manager>} /><Route path="templates/:id/edit" element={<Manager><TemplateEditorPage /></Manager>} /><Route path="settings/users" element={<Manager><UserManagementPage /></Manager>} /><Route path="settings/audit" element={<Manager><AuditLogPage /></Manager>} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes>; }
