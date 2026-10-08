import type { BillingService } from '../../../doctor/billing/billing.service';
import type { ToolHandlers } from './tool-handler';

/** Treatment invoices, payments and the financial reports built on them (read-only). */
export function billingTools(billing: BillingService): ToolHandlers {
  const listInvoices: ToolHandlers[string] = (a) =>
    billing.findAll({
      patient_id: a.num('patient_id'),
      status: a.str('status'),
      from: a.str('from'),
      to: a.str('to'),
      page: a.numOr(1, 'page'),
      limit: a.numOr(20, 'limit'),
    });

  return {
    // Reports
    get_financial_kpis: () => billing.getKpis(),
    get_financial_summary: (a) =>
      billing.getSummary({ from: a.str('from'), to: a.str('to') }),
    get_payments_analytics: (a) =>
      billing.getPaymentsAnalytics(a.numOr(12, 'months')),
    get_outstanding_payments: () => billing.getOutstandingPayments(),
    get_aging_report: () => billing.getAgingReport(),
    get_patient_financials: (a) =>
      billing.getPatientFinancials(a.num('patient_id')),

    // Invoices. list_payments is an older alias kept for saved conversations.
    list_invoices: listInvoices,
    list_payments: listInvoices,
    get_invoice: (a) => billing.findOne(a.id('id')),
  };
}
