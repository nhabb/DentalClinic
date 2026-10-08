import type { BillingService } from '../../../doctor/billing/billing.service';
import { todayIso, type ToolHandlers } from './tool-handler';

/** Treatment invoices, payments and the financial reports built on them. */
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

  const createInvoice: ToolHandlers[string] = (a) =>
    billing.create({
      patient_id: a.reqNum('patient_id'),
      procedure_date: a.strOr(todayIso(), 'procedure_date', 'date'),
      notes: a.str('notes', 'description'),
      line_items: a.objects('line_items')?.map((item) => ({
        procedure_name: item.strOr('Procedure', 'procedure_name'),
        amount: item.numOr(0, 'amount'),
      })) ?? [{ procedure_name: 'Checkup', amount: a.numOr(0, 'amount') }],
    });

  const recordPayment: ToolHandlers[string] = (a) =>
    billing.recordPayment(a.id('invoice_id', 'id'), {
      amount: a.reqNum('amount', 'amount_paid'),
      payment_method: a.strOr('cash', 'payment_method'),
      notes: a.str('notes'),
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

    // Invoices. The *_payment names are older aliases kept for saved conversations.
    list_invoices: listInvoices,
    list_payments: listInvoices,
    get_invoice: (a) => billing.findOne(a.id('id')),
    create_invoice: createInvoice,
    create_payment: createInvoice,
    record_invoice_payment: recordPayment,
    record_payment: recordPayment,
  };
}
