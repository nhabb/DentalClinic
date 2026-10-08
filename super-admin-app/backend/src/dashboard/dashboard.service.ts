import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Platform-wide numbers for the console home page. */
export interface PlatformOverview {
  organizations: { total: number; active: number; new_this_month: number };
  branches: number;
  patients: number;
  staff: number;
  appointments_this_month: number;
  revenue_this_month: number;
  revenue_all_time: number;
  /** Last six months, oldest first. */
  monthly: { month: string; new_organizations: number; appointments: number; collected: number }[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<PlatformOverview> {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const [orgTotal, orgActive, orgNew, branches, patients, staff, apptMonth, revMonth, revAll, monthly] =
      await Promise.all([
        this.prisma.organizations.count(),
        this.prisma.organizations.count({ where: { is_active: true } }),
        this.prisma.organizations.count({ where: { created_at: { gte: startOfMonth } } }),
        this.prisma.branches.count({ where: { is_active: true } }),
        this.prisma.patient_profiles.count(),
        this.prisma.users.count({
          where: { role: { in: ['doctor', 'secretary', 'admin'] }, is_active: true },
        }),
        this.prisma.appointments.count({ where: { created_at: { gte: startOfMonth } } }),
        this.prisma.invoice_payments.aggregate({
          where: { created_at: { gte: startOfMonth } },
          _sum: { amount: true },
        }),
        this.prisma.invoice_payments.aggregate({ _sum: { amount: true } }),
        this.monthlySeries(),
      ]);

    return {
      organizations: { total: orgTotal, active: orgActive, new_this_month: orgNew },
      branches,
      patients,
      staff,
      appointments_this_month: apptMonth,
      revenue_this_month: Number(revMonth._sum.amount ?? 0),
      revenue_all_time: Number(revAll._sum.amount ?? 0),
      monthly,
    };
  }

  private async monthlySeries() {
    const rows = await this.prisma.$queryRaw<
      { month: Date; new_organizations: number; appointments: number; collected: number }[]
    >`
      WITH months AS (
        SELECT date_trunc('month', now()) - (interval '1 month' * g) AS month
        FROM generate_series(0, 5) AS g
      )
      SELECT m.month,
             (SELECT count(*)::int FROM organizations o WHERE date_trunc('month', o.created_at) = m.month) AS new_organizations,
             (SELECT count(*)::int FROM appointments a WHERE date_trunc('month', a.created_at) = m.month) AS appointments,
             (SELECT coalesce(sum(p.amount), 0)::float FROM invoice_payments p WHERE date_trunc('month', p.created_at) = m.month) AS collected
      FROM months m
      ORDER BY m.month`;
    return rows.map((r) => ({ ...r, month: r.month.toISOString().slice(0, 7) }));
  }
}
