import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('admin reports inbox and KPI hardening', () => {
  it('enforces admin session guard for new moderation methods', () => {
    const adminSource = fs.readFileSync('app/actions/admin.ts', 'utf8');
    expect(adminSource).toContain('export async function getReportActionHistory');
    expect(adminSource).toContain('export async function addReportModeratorNote');
    expect(adminSource).toContain('export async function applyModerationAction');
    expect(adminSource).toContain('await requireAdminSession()');
  });

  it('renders reports inbox and manager-facing KPI cards', () => {
    const reportsPage = fs.readFileSync('app/admin/reports/page.tsx', 'utf8');
    const obsPage = fs.readFileSync('app/admin/observability/page.tsx', 'utf8');
    expect(reportsPage).toContain('Reports Inbox');
    expect(reportsPage).toContain('Action history');
    expect(obsPage).toContain('Product KPIs (manager view)');
    expect(obsPage).toContain('KpiCard');
  });
});
