/**
 * End-to-end check of the quote → invoice → payment → refund → void flow
 * against a running backend and the real database, inside a throwaway clinic
 * that is removed at the end. Proves the business rules the way a desk would
 * hit them: document numbers, discounts, due dates, payment dates, one live
 * invoice per quote, no double billing from the chart, and the reports.
 *
 *   node scripts/smoke-billing.js        (API_URL defaults to http://localhost:5000)
 */
const {
  api,
  deleteOrganizationBySlug,
  login,
  record,
  report,
  waitForServer,
} = require('./lib/smoke-helpers');

const SLUG = `smoke-billing-${Date.now().toString(36)}`;
// Days on the clinic's calendar, which is what the API counts in: computing
// "today" in UTC disagrees with the server for part of every day.
const CLINIC_TZ = process.env.CLINIC_TIMEZONE || 'Asia/Beirut';
const day = (offset = 0) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offset * 86_400_000));
const num = (v) => Number(v);

async function main() {
  if (!(await waitForServer())) throw new Error('backend is not reachable');

  // ── A throwaway clinic, acted in by the platform admin ───────────────────
  const sup = await login('super@demo.com');
  record('login superadmin', sup.ok, sup.detail);
  if (!sup.ok) throw new Error('cannot continue without the superadmin login');

  const org = await api('POST', '/organizations', {
    token: sup.token,
    body: {
      name: 'Smoke Billing Clinic',
      slug: SLUG,
      default_branch: { name: 'Main', city: 'Beirut' },
    },
  });
  record('create throwaway clinic', org.status === 201, `status ${org.status}`);
  if (org.status !== 201) throw new Error('no clinic');
  const as = {
    token: sup.token,
    headers: { 'x-organization-id': String(org.json.id) },
  };
  const actorId = num(sup.user.id);

  const patient = await api('POST', '/patients', {
    ...as,
    body: {
      email: `${SLUG}-patient@example.com`,
      first_name: 'Smoke',
      last_name: 'Billing',
    },
  });
  record('create patient', patient.status === 201, `status ${patient.status}`);
  const patientId = num((await api('GET', '/patients?limit=1', as)).json.data[0].id);

  // ── Planned work on the chart, quoted with a discount ────────────────────
  const planned = await api('POST', '/patient-work', {
    ...as,
    body: {
      patient_id: patientId,
      treatment_date: day(),
      create_invoice: false,
      items: [
        { tooth_number: '16', procedure_name: 'Crown', status: 'planned', amount: 300 },
      ],
    },
  });
  const recordId = num(
    (planned.json?.chart?.history ?? []).find((r) => r.record_type === 'treatment_plan')?.id,
  );
  record('plan a crown on the chart', planned.status === 201 && recordId > 0, `status ${planned.status}`);

  const past = await api('POST', '/quotes', {
    ...as,
    body: {
      patient_id: patientId,
      valid_until: '2000-01-01',
      items: [{ procedure_name: 'X-Ray', amount: 20 }],
    },
  });
  record('quote refuses a validity date in the past', past.status === 400, `status ${past.status}`);

  const tooBig = await api('POST', '/quotes', {
    ...as,
    body: {
      patient_id: patientId,
      quoted_discount: 500,
      items: [{ procedure_name: 'X-Ray', amount: 20 }],
    },
  });
  record('quote refuses a discount above its lines', tooBig.status === 400, `status ${tooBig.status}`);

  const q = await api('POST', '/quotes', {
    ...as,
    body: {
      patient_id: patientId,
      valid_until: day(30),
      quoted_discount: 50,
      notes: 'Crown and the x-ray before it',
      items: [
        { record_id: recordId, procedure_name: 'Crown', tooth_number: '16', amount: 300 },
        { procedure_name: 'X-Ray', amount: 20 },
      ],
    },
  });
  record('create quote', q.status === 201, `status ${q.status} ${q.json?.message ?? ''}`);
  const quoteId = num(q.json?.id);
  record(
    'quote is numbered QUO-<year>-<nnnnn> by the clinic',
    /^QUO-\d{4}-\d{5}$/.test(q.json?.quote_number ?? ''),
    q.json?.quote_number,
  );
  record('quote total = lines - discount (320 - 50)', num(q.json?.quoted_total) === 270, q.json?.quoted_total);

  const q2 = await api('POST', '/quotes', {
    ...as,
    body: { patient_id: patientId, items: [{ procedure_name: 'Checkup', amount: 30 }] },
  });
  const seq = (n) => Number(String(n).split('-').pop());
  record(
    'the next quote takes the next number',
    seq(q2.json?.quote_number) === seq(q.json?.quote_number) + 1,
    `${q.json?.quote_number} -> ${q2.json?.quote_number}`,
  );

  const sent = await api('POST', `/quotes/${quoteId}/send`, as);
  record('send quote', sent.json?.status === 'sent', `status ${sent.status}`);
  const earlyInvoice = await api('POST', `/quotes/${quoteId}/invoice`, { ...as, body: {} });
  record('a sent (not accepted) quote cannot be invoiced', earlyInvoice.status === 409, `status ${earlyInvoice.status}`);

  const accepted = await api('POST', `/quotes/${quoteId}/accept`, as);
  record('accept quote', accepted.json?.status === 'accepted' && !!accepted.json?.sent_at, `status ${accepted.status}`);

  // ── Bill the accepted quote as it stands ─────────────────────────────────
  const inv = await api('POST', `/quotes/${quoteId}/invoice`, { ...as, body: {} });
  record('issue invoice from the accepted quote', inv.status === 201, `status ${inv.status} ${inv.json?.message ?? ''}`);
  const invoiceId = num(inv.json?.id);
  record(
    'invoice is numbered INV-<year>-<nnnnn>',
    /^INV-\d{4}-\d{5}$/.test(inv.json?.invoice_number ?? ''),
    inv.json?.invoice_number,
  );
  record(
    'invoice carries subtotal 320, discount 50, total 270, nothing paid',
    num(inv.json?.subtotal) === 320 &&
      num(inv.json?.discount_amount) === 50 &&
      num(inv.json?.total_amount) === 270 &&
      num(inv.json?.remaining_amount) === 270 &&
      inv.json?.status === 'open',
    JSON.stringify({ s: inv.json?.subtotal, d: inv.json?.discount_amount, t: inv.json?.total_amount }),
  );
  record(
    'invoice is due on receipt and linked to the quote',
    String(inv.json?.due_date).slice(0, 10) === String(inv.json?.procedure_date).slice(0, 10) &&
      num(inv.json?.quote?.id) === quoteId,
    `due ${inv.json?.due_date} quote ${inv.json?.quote?.quote_number}`,
  );
  record('invoice issued by the signed-in user', num(inv.json?.created_by) === actorId, `created_by ${inv.json?.created_by}`);
  record('discount reason names the quote', /Agreed on quote QUO-/.test(inv.json?.discount_reason ?? ''), inv.json?.discount_reason);

  const twice = await api('POST', `/quotes/${quoteId}/invoice`, { ...as, body: {} });
  record('a second live invoice from the same quote is refused', twice.status === 409, `status ${twice.status}`);

  // ── The chart cannot bill that work again ────────────────────────────────
  const rebill = await api('POST', '/patient-work/complete', {
    ...as,
    body: { patient_id: patientId, items: [{ record_id: recordId, amount: 300 }] },
  });
  record('completing billed-up-front work with a price is refused', rebill.status === 400, `status ${rebill.status}`);
  const complete = await api('POST', '/patient-work/complete', {
    ...as,
    body: { patient_id: patientId, items: [{ record_id: recordId }] },
  });
  record(
    'completing it without a price marks it done and bills nothing',
    complete.status === 201 && complete.json?.billed === 0 && complete.json?.completed === 1,
    `status ${complete.status} billed=${complete.json?.billed}`,
  );

  // ── Money: payment dates, refunds, reports ───────────────────────────────
  const future = await api('POST', `/billing/invoices/${invoiceId}/payments`, {
    ...as,
    body: { amount: 10, payment_method: 'cash', payment_date: day(7) },
  });
  record('a payment dated in the future is refused', future.status === 400, `status ${future.status}`);

  const pay = await api('POST', `/billing/invoices/${invoiceId}/payments`, {
    ...as,
    body: { amount: 100, payment_method: 'cash', payment_date: day(-1), notes: 'cash from yesterday' },
  });
  const payRow = pay.json?.invoice_payments?.[0];
  record(
    'payment recorded on the day it was received, by the signed-in user',
    pay.json?.status === 'partial' &&
      String(payRow?.payment_date).slice(0, 10) === day(-1) &&
      num(payRow?.created_by) === actorId,
    `status ${pay.status} date ${payRow?.payment_date}`,
  );

  const refund = await api('POST', `/billing/invoices/${invoiceId}/refunds`, {
    ...as,
    body: { amount: 30, payment_method: 'cash', reason: 'Overcharged at the desk' },
  });
  record('refund lowers what was received (100 - 30)', num(refund.json?.amount_paid) === 70, `paid ${refund.json?.amount_paid}`);

  const outstanding = await api('GET', '/billing/outstanding', as);
  const row = (outstanding.json ?? []).find((r) => r.id === invoiceId);
  record(
    'outstanding list shows the number, due date and days overdue',
    !!row && row.invoice_number === inv.json?.invoice_number && row.days_overdue === 0 && row.remaining === 200,
    JSON.stringify(row ? { n: row.invoice_number, d: row.days_overdue, r: row.remaining } : null),
  );

  const aging = await api('GET', '/billing/aging', as);
  record(
    'aging report: a balance due today is current, nothing overdue',
    aging.json?.buckets?.not_yet_due === 200 && aging.json?.total_overdue === 0,
    JSON.stringify(aging.json?.buckets),
  );

  const summary = await api('GET', `/billing/summary?from=${day(-1)}&to=${day()}`, as);
  record(
    'summary reports income by payment date (100 in, 30 back)',
    num(summary.json?.total_income) === 70 && num(summary.json?.total_refunded) === 30,
    JSON.stringify({ income: summary.json?.total_income, refunded: summary.json?.total_refunded }),
  );
  const earlier = await api('GET', `/billing/summary?from=${day(-30)}&to=${day(-2)}`, as);
  record('a window before the payment date sees none of it', num(earlier.json?.total_income) === 0, `income ${earlier.json?.total_income}`);

  const voidHeld = await api('POST', `/billing/invoices/${invoiceId}/void`, { ...as, body: { reason: 'Wrong patient' } });
  record('void is refused while money is held', voidHeld.status === 409, `status ${voidHeld.status}`);
  await api('POST', `/billing/invoices/${invoiceId}/refunds`, {
    ...as,
    body: { amount: 70, payment_method: 'cash', reason: 'Treatment not going ahead' },
  });
  const voided = await api('POST', `/billing/invoices/${invoiceId}/void`, { ...as, body: { reason: 'Treatment not going ahead' } });
  record('void after a full refund', voided.json?.status === 'cancelled', `status ${voided.status}`);
  const chart = await api('GET', `/patient-work/chart/${patientId}`, as);
  const released = (chart.json?.history ?? []).find((r) => num(r.id) === recordId);
  record('void releases the chart record', released && released.invoice_id === null, `invoice_id ${released?.invoice_id}`);
  const again = await api('POST', `/quotes/${quoteId}/invoice`, { ...as, body: {} });
  record('after the void the quote can be invoiced again', again.status === 201, `status ${again.status} ${again.json?.message ?? ''}`);

  // ── Invoices from the billing page ───────────────────────────────────────
  const noReason = await api('POST', '/billing/invoices', {
    ...as,
    body: { patient_id: patientId, procedure_date: day(), discount_amount: 5, line_items: [{ procedure_name: 'Checkup', amount: 50 }] },
  });
  record('billing page: a discount without a reason is refused', noReason.status === 400, `status ${noReason.status}`);
  const badDue = await api('POST', '/billing/invoices', {
    ...as,
    body: { patient_id: patientId, procedure_date: day(), due_date: day(-3), line_items: [{ procedure_name: 'Checkup', amount: 50 }] },
  });
  record('billing page: a due date before the work is refused', badDue.status === 400, `status ${badDue.status}`);
  const noLines = await api('POST', '/billing/invoices', {
    ...as,
    body: { patient_id: patientId, procedure_date: day(), line_items: [] },
  });
  record('billing page: an invoice needs at least one line', noLines.status === 400, `status ${noLines.status}`);

  const agingBefore = (await api('GET', '/billing/aging', as)).json?.buckets ?? {};
  const terms = await api('POST', '/billing/invoices', {
    ...as,
    body: {
      patient_id: patientId,
      procedure_date: day(),
      due_date: day(30),
      discount_amount: 10,
      discount_reason: 'Family discount',
      line_items: [{ procedure_name: 'Checkup', amount: 50, tooth_number: '11' }],
    },
  });
  record(
    'billing page: invoice with terms and a discount (50 - 10, due in 30 days)',
    terms.status === 201 &&
      num(terms.json?.total_amount) === 40 &&
      String(terms.json?.due_date).slice(0, 10) === day(30) &&
      terms.json?.line_items?.[0]?.tooth_number === '11',
    `status ${terms.status} total ${terms.json?.total_amount} due ${terms.json?.due_date}`,
  );
  const future30 = await api('GET', '/billing/aging', as);
  record(
    'a balance due in 30 days ages as not yet due',
    future30.json?.buckets?.not_yet_due === (agingBefore.not_yet_due ?? 0) + 40,
    JSON.stringify(future30.json?.buckets),
  );

  const free = await api('POST', '/billing/invoices', {
    ...as,
    body: { patient_id: patientId, procedure_date: day(), line_items: [{ procedure_name: 'Checkup', amount: 0 }] },
  });
  record('billing page: a free-of-charge invoice is settled, not open', free.json?.status === 'paid', `status ${free.json?.status}`);

  const list = await api('GET', '/billing/invoices?limit=50', as);
  const numbers = (list.json?.data ?? []).map((i) => i.invoice_number);
  record(
    'every invoice of the clinic has a distinct number',
    numbers.length >= 4 && new Set(numbers).size === numbers.length,
    numbers.join(' '),
  );
}

main()
  .then(() => report())
  .catch((err) => report(err))
  .finally(async () => {
    try {
      await deleteOrganizationBySlug(SLUG);
    } catch (err) {
      console.error('cleanup failed', err.message);
    }
  });
