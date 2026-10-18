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
  PASSWORD,
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
  // The chart is clinical only: it never creates an invoice, whatever is priced.
  const planned = await api('POST', '/patient-work', {
    ...as,
    body: {
      patient_id: patientId,
      treatment_date: day(),
      items: [
        { tooth_number: '16', procedure_name: 'Crown', status: 'planned' },
      ],
    },
  });
  const recordId = num(
    (planned.json?.chart?.history ?? []).find((r) => r.record_type === 'treatment_plan')?.id,
  );
  record('plan a crown on the chart', planned.status === 201 && recordId > 0, `status ${planned.status}`);

  // Price it on the chart. The chart is where work is planned AND priced,
  // and it still creates no money of any kind.
  const priced = await api('PATCH', `/patient-work/records/${recordId}/price`, {
    ...as,
    body: { amount: 300 },
  });
  record('price the planned crown on the chart', priced.status === 200, `status ${priced.status}`);

  const planRead = await api('GET', `/quotes/patients/${patientId}`, as);
  const quoteId = num(planRead.json?.quote_id);
  record(
    'the plan is numbered QUO-<year>-<nnnnn> by the clinic',
    /^QUO-\d{4}-\d{5}$/.test(planRead.json?.quote_number ?? ''),
    planRead.json?.quote_number,
  );
  record(
    'the plan total is simply the chart work (300)',
    num(planRead.json?.totals?.plan) === 300,
    `total ${planRead.json?.totals?.plan}`,
  );

  const sent = await api('POST', `/quotes/${quoteId}/send`, as);
  record(
    'give the plan to the patient; what they were handed is recorded',
    sent.status === 201 && (sent.json?.sends ?? []).length === 1,
    `status ${sent.status} sends ${(sent.json?.sends ?? []).length}`,
  );
  const accepted = await api('POST', `/quotes/${quoteId}/accept`, as);
  record(
    'record that the patient agreed',
    accepted.status === 201 && !!accepted.json?.accepted_at,
    `status ${accepted.status}`,
  );

  // ── Bill it from the billing page, the one door ─────────────────────────
  const inv = await api('POST', '/billing/invoices', {
    ...as,
    body: {
      patient_id: patientId,
      procedure_date: day(),
      discount_amount: 50,
      discount_reason: 'Agreed on the plan',
      line_items: [
        { record_id: recordId, procedure_name: 'Crown', tooth_number: '16', amount: 300 },
        { procedure_name: 'X-Ray', amount: 20 },
      ],
    },
  });
  record('issue the invoice from the billing page', inv.status === 201, `status ${inv.status} ${inv.json?.message ?? ''}`);
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
    'invoice is due on receipt',
    String(inv.json?.due_date).slice(0, 10) === String(inv.json?.procedure_date).slice(0, 10),
    `due ${inv.json?.due_date}`,
  );
  record('invoice issued by the signed-in user', num(inv.json?.created_by) === actorId, `created_by ${inv.json?.created_by}`);

  // The plan keeps the line, locked at what the invoice charged.
  const afterBill = await api('GET', `/quotes/patients/${patientId}`, as);
  const lockedLine = (afterBill.json?.lines ?? []).find((l) => num(l.record_id) === recordId);
  record(
    'the billed line stays in the plan, locked and priced',
    lockedLine?.state === 'billed' && lockedLine?.locked === true,
    `state ${lockedLine?.state} locked ${lockedLine?.locked}`,
  );

  // ── The chart figure and the money figure are different questions ──────
  // The chart priced the crown at 300; the bill came to 270 after a 50
  // discount and a 20 x-ray that was never chart work. Those two are not
  // meant to match, and the statement keeps them under different keys so
  // nobody compares them by accident.
  {
    const st = await api(`GET`, `/billing/patients/${patientId}/statement`, as);
    const f = st.json?.figures ?? {};
    const pf = st.json?.plan_figures ?? {};
    record(
      `the statement bills what the invoice says, not what the chart priced`,
      num(f.billed) === 270 && num(pf.billed_value) === 300,
      `billed ${f.billed} vs billed_value ${pf.billed_value}`,
    );
    record(
      `and the money side balances: billed - paid = unpaid`,
      Math.abs(num(f.billed) - num(f.applied) - num(f.due_now)) < 0.005 &&
        Math.abs(num(f.received) - num(f.applied) - num(f.credit_held)) < 0.005,
      JSON.stringify(f),
    );
  }

  const twice = await api('POST', '/billing/invoices', {
    ...as,
    body: {
      patient_id: patientId,
      procedure_date: day(),
      line_items: [{ record_id: recordId, procedure_name: 'Crown', amount: 300 }],
    },
  });
  record(
    'the same plan line cannot be billed a second time',
    twice.status === 400 || twice.status === 409,
    `status ${twice.status}`,
  );

  // ── The chart cannot bill that work again ────────────────────────────────
  const complete = await api('POST', '/patient-work/complete', {
    ...as,
    body: { patient_id: patientId, items: [{ record_id: recordId }] },
  });
  record(
    'the chart marks planned work done and bills nothing',
    complete.status === 201 && complete.json?.completed === 1 && !complete.json?.invoice,
    `status ${complete.status} completed=${complete.json?.completed}`,
  );
  const chartNeverBills = await api('POST', '/patient-work', {
    ...as,
    body: {
      patient_id: patientId,
      treatment_date: day(),
      items: [{ tooth_number: '26', procedure_name: 'Filling', status: 'completed' }],
    },
  });
  record(
    'the chart creates no invoice for completed work',
    chartNeverBills.status === 201 && !chartNeverBills.json?.invoice,
    `status ${chartNeverBills.status} invoice=${JSON.stringify(chartNeverBills.json?.invoice ?? null)}`,
  );
  const fillingId = num(
    (chartNeverBills.json?.chart?.history ?? []).find(
      (r) => r.tooth_number === '26' && r.invoice_id === null,
    )?.id,
  );

  const pricedFromChart = await api('POST', '/patient-work/complete', {
    ...as,
    body: { patient_id: patientId, items: [{ record_id: fillingId, amount: 90 }] },
  });
  record(
    'the chart refuses a price: money is not its business',
    pricedFromChart.status === 400,
    `status ${pricedFromChart.status}`,
  );

  // ── The billing page is the one door: bill that chart work from here ─────
  const billable = await api('GET', `/billing/patients/${patientId}/billable`, as);
  record(
    'the billing page lists the unbilled completed work',
    billable.status === 200 &&
      (billable.json?.completed_unbilled ?? []).some((r) => num(r.id) === fillingId),
    `status ${billable.status} count=${(billable.json?.completed_unbilled ?? []).length}`,
  );

  const fromChart = await api('POST', '/billing/invoices', {
    ...as,
    body: {
      patient_id: patientId,
      procedure_date: day(),
      line_items: [
        { record_id: fillingId, procedure_name: 'Filling', tooth_number: '26', amount: 90 },
      ],
    },
  });
  record(
    'the billing page bills chart work and attaches the record',
    fromChart.status === 201 && num(fromChart.json?.total_amount) === 90,
    `status ${fromChart.status} ${fromChart.json?.message ?? ''}`,
  );
  const doubleBill = await api('POST', '/billing/invoices', {
    ...as,
    body: {
      patient_id: patientId,
      procedure_date: day(),
      line_items: [
        { record_id: fillingId, procedure_name: 'Filling', tooth_number: '26', amount: 90 },
      ],
    },
  });
  record(
    'billing the same chart work twice is refused',
    doubleBill.status === 400,
    `status ${doubleBill.status}`,
  );
  const stillListed = await api('GET', `/billing/patients/${patientId}/billable`, as);
  record(
    'billed work leaves the unbilled list',
    !(stillListed.json?.completed_unbilled ?? []).some((r) => num(r.id) === fillingId),
    `count=${(stillListed.json?.completed_unbilled ?? []).length}`,
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

  // 200 still owed on the quote's invoice, plus the 90 filling billed from the
  // billing page: both are due today, so both are current.
  const aging = await api('GET', '/billing/aging', as);
  record(
    'aging report: balances due today are current, nothing overdue',
    aging.json?.buckets?.not_yet_due === 290 && aging.json?.total_overdue === 0,
    JSON.stringify(aging.json?.buckets),
  );

  // ── One clinic, one number ─────────────────────────────────────────────
  // "Outstanding" had five implementations with two different predicates, so
  // the summary, the KPIs, the aging report and the outstanding list could
  // each quote a different figure one click apart.
  const [sumRes, kpiRes, ageRes, outRes] = await Promise.all([
    api(`GET`, `/billing/summary`, as),
    api(`GET`, `/billing/kpis`, as),
    api(`GET`, `/billing/aging`, as),
    api(`GET`, `/billing/outstanding`, as),
  ]);
  const listedUnpaid = (outRes.json ?? []).reduce((t, r) => t + num(r.remaining), 0);
  const unpaid = num(sumRes.json?.total_outstanding);
  record(
    `summary, KPIs, aging and the outstanding list quote one unpaid figure`,
    Math.abs(unpaid - num(kpiRes.json?.all_time?.total_outstanding)) < 0.005 &&
      Math.abs(unpaid - num(ageRes.json?.total_outstanding)) < 0.005 &&
      Math.abs(unpaid - listedUnpaid) < 0.005,
    `summary ${unpaid} kpis ${kpiRes.json?.all_time?.total_outstanding} aging ${ageRes.json?.total_outstanding} list ${listedUnpaid}`,
  );
  record(
    `and one overdue figure, read off the clinic calendar by both`,
    Math.abs(num(kpiRes.json?.all_time?.total_overdue) - num(ageRes.json?.total_overdue)) < 0.005,
    `kpis ${kpiRes.json?.all_time?.total_overdue} aging ${ageRes.json?.total_overdue}`,
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
  const again = await api('POST', '/billing/invoices', {
    ...as,
    body: {
      patient_id: patientId,
      procedure_date: day(),
      line_items: [{ record_id: recordId, procedure_name: 'Crown', tooth_number: '16', amount: 300 }],
    },
  });
  record('after the void the released work can be billed again', again.status === 201, `status ${again.status} ${again.json?.message ?? ''}`);

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

  // ── A treatment plan billed visit by visit ───────────────────────────────
  // The quote may carry one live invoice, so billing part of it must not
  // stamp quote_id and strand the rest (that failed with a 500 before).
  const plan = await api('POST', '/patient-work', {
    ...as,
    body: {
      patient_id: patientId,
      treatment_date: day(),
      items: [
        { tooth_number: '36', procedure_name: 'Root Canal', status: 'planned' },
        { tooth_number: '36', procedure_name: 'Crown', status: 'planned' },
      ],
    },
  });
  const plannedIds = (plan.json?.chart?.history ?? [])
    .filter((r) => r.record_type === 'treatment_plan' && r.tooth_number === '36')
    .map((r) => num(r.id));
  record('plan two visits of work on one tooth', plannedIds.length === 2, `ids ${plannedIds}`);

  // Price both visits on the chart; one plan carries them both.
  await api('PATCH', `/patient-work/records/${plannedIds[0]}/price`, { ...as, body: { amount: 200 } });
  await api('PATCH', `/patient-work/records/${plannedIds[1]}/price`, { ...as, body: { amount: 250 } });
  const twoVisit = await api('GET', `/quotes/patients/${patientId}`, as);
  record(
    'one plan holds both visits (200 + 250 of the 450 still unbilled)',
    num(twoVisit.json?.totals?.planned) >= 450,
    `planned ${twoVisit.json?.totals?.planned}`,
  );

  // Visit 1: the root canal is done and billed on its own.
  await api('POST', '/patient-work/complete', {
    ...as,
    body: { patient_id: patientId, items: [{ record_id: plannedIds[0] }] },
  });
  const visit1 = await api('POST', '/billing/invoices', {
    ...as,
    body: {
      patient_id: patientId,
      procedure_date: day(),
      line_items: [{ record_id: plannedIds[0], procedure_name: 'Root Canal', tooth_number: '36', amount: 200 }],
    },
  });
  record('visit 1 of a plan is billed', visit1.status === 201, `status ${visit1.status} ${visit1.json?.message ?? ''}`);

  // Billing part of a plan must leave the rest billable. There is no quote
  // link to strand any more, which is the point: the record is the unit.
  const stillOpen = await api('GET', `/billing/patients/${patientId}/billable`, as);
  record(
    'billing part of a plan leaves the rest billable',
    (stillOpen.json?.plan_unbilled ?? []).some((r) => num(r.id) === plannedIds[1]),
    `${(stillOpen.json?.plan_unbilled ?? []).length} still billable`,
  );

  // The API returns ids as strings (BigInt.prototype.toJSON), so a record id
  // handed straight back from a listing must be accepted, not refused as
  // "record_id must be an integer number".
  const plannedFromApi = (stillOpen.json?.plan_unbilled ?? []).find(
    (r) => num(r.id) === plannedIds[1],
  );
  record(
    'the billable listing returns ids the way the API always does (strings)',
    typeof plannedFromApi?.id === 'string',
    `typeof id = ${typeof plannedFromApi?.id}`,
  );

  // Visit 2: the crown, weeks later. This is what used to 500.
  await api('POST', '/patient-work/complete', {
    ...as,
    body: { patient_id: patientId, items: [{ record_id: plannedIds[1] }] },
  });
  const visit2 = await api('POST', '/billing/invoices', {
    ...as,
    body: {
      patient_id: patientId,
      procedure_date: day(),
      line_items: [{ record_id: plannedIds[1], procedure_name: 'Crown', tooth_number: '36', amount: 250 }],
    },
  });
  record(
    'visit 2 of the same quoted plan is billed too (never a 500)',
    visit2.status === 201 && num(visit2.json?.total_amount) === 250,
    `status ${visit2.status} ${visit2.json?.message ?? ''}`,
  );

  // ── The patient ledger: money before there is a bill ─────────────────────
  // A deposit on an accepted plan arrives long before the invoices it will
  // pay, so the money belongs to the patient and is applied as bills appear.

  const deposit = await api('POST', `/billing/patients/${patientId}/payments`, {
    ...as,
    body: { amount: 1000, payment_method: 'cash', notes: 'Deposit on the plan', auto_apply: false },
  });
  record(
    'a deposit can be taken with no invoice named',
    deposit.status === 201 && num(deposit.json?.credit_balance) === 1000,
    `status ${deposit.status} credit ${deposit.json?.credit_balance}`,
  );
  const depositId = deposit.json?.payments?.[0]?.id;

  const openInvoice = await api('POST', '/billing/invoices', {
    ...as,
    body: {
      patient_id: patientId,
      procedure_date: day(),
      line_items: [{ procedure_name: 'Checkup', amount: 400 }],
    },
  });
  const creditInvoiceId = openInvoice.json?.id;
  record(
    'a bill is issued after the deposit was taken',
    openInvoice.status === 201 && creditInvoiceId !== undefined,
    `status ${openInvoice.status} ${openInvoice.json?.message ?? ''}`,
  );

  const applied = await api('POST', `/billing/payments/${depositId}/allocations`, {
    ...as,
    body: { invoice_id: num(creditInvoiceId), amount: 400 },
  });
  record(
    'credit pays a bill issued after the money arrived',
    applied.status === 201 && num(applied.json?.credit_balance) === 600,
    `status ${applied.status} credit ${applied.json?.credit_balance} ${applied.json?.message ?? ''}`,
  );

  const paidInvoice = (applied.json?.open_invoices ?? []).find((i) => num(i.id) === num(creditInvoiceId));
  record(
    'the invoice it paid is settled and off the open list',
    paidInvoice === undefined,
    `still open: ${paidInvoice ? paidInvoice.invoice_number : 'no'}`,
  );

  const tooMuch = await api('POST', `/billing/payments/${depositId}/allocations`, {
    ...as,
    body: { invoice_id: num(creditInvoiceId), amount: 400 },
  });
  record(
    'applying credit to an invoice that owes nothing is refused',
    tooMuch.status === 400,
    `status ${tooMuch.status}`,
  );

  const otherPatient = await api('POST', `/billing/payments/${depositId}/allocations`, {
    ...as,
    body: { invoice_id: 1, amount: 10 },
  });
  record(
    "credit cannot be moved to another patient's invoice",
    otherPatient.status === 400 || otherPatient.status === 404,
    `status ${otherPatient.status}`,
  );

  const overRefund = await api('POST', `/billing/patients/${patientId}/credit-refunds`, {
    ...as,
    body: { amount: 5000, payment_method: 'cash', reason: 'More than is held' },
  });
  record(
    'refunding more credit than the patient has is refused',
    overRefund.status === 400,
    `status ${overRefund.status}`,
  );

  const creditRefund = await api('POST', `/billing/patients/${patientId}/credit-refunds`, {
    ...as,
    body: { amount: 600, payment_method: 'cash', reason: 'Patient abandoned the plan' },
  });
  record(
    'the rest of the deposit is handed back and the credit empties',
    creditRefund.status === 201 && num(creditRefund.json?.credit_balance) === 0,
    `status ${creditRefund.status} credit ${creditRefund.json?.credit_balance}`,
  );

  const settled = await api('POST', `/billing/patients/${patientId}/payments`, {
    ...as,
    body: { amount: 10000, payment_method: 'card' },
  });
  record(
    'a payment with no invoice named settles the open bills oldest first',
    settled.status === 201 &&
      (settled.json?.open_invoices ?? []).every((i) => num(i.remaining_amount) === 0),
    `status ${settled.status} still owed ${(settled.json?.open_invoices ?? []).reduce((s, i) => s + num(i.remaining_amount), 0)}`,
  );
  record(
    'what it could not spend stays as credit',
    num(settled.json?.credit_balance) > 0,
    `credit ${settled.json?.credit_balance}`,
  );

  // A refund is money that left the clinic. Its allocation is what subtracts
  // it from the invoice, so unapplying it would quietly mark the bill paid
  // again -- refused in the service and, at COMMIT, by the database. Deleting
  // the refund outright still works, and takes its allocation with it.

  const refundBill = await api('POST', '/billing/invoices', {
    ...as,
    body: {
      patient_id: patientId,
      procedure_date: day(),
      line_items: [{ procedure_name: 'Checkup', amount: 200 }],
    },
  });
  const refundBillId = refundBill.json?.id;
  await api('POST', `/billing/invoices/${num(refundBillId)}/payments`, {
    ...as,
    body: { amount: 200, payment_method: 'cash' },
  });
  const refunded = await api('POST', `/billing/invoices/${num(refundBillId)}/refunds`, {
    ...as,
    body: { amount: 50, payment_method: 'cash', reason: 'Overcharged' },
  });
  const refundRow = (refunded.json?.invoice_payments ?? []).find((p) => p.kind === 'refund');
  record(
    'the refund lowers the bill and is listed with its own allocation',
    num(refunded.json?.amount_paid) === 150 && refundRow !== undefined,
    `paid ${refunded.json?.amount_paid}`,
  );

  const unapplyRefund = await api('DELETE', `/billing/allocations/${num(refundRow?.id)}`, as);
  record(
    'a refund cannot be unapplied back onto the invoice',
    unapplyRefund.status === 400,
    `status ${unapplyRefund.status} ${unapplyRefund.json?.message ?? ''}`,
  );

  const stillRefunded = await api('GET', `/billing/invoices/${num(refundBillId)}`, as);
  record(
    'the refused unapply left the bill exactly as it was',
    num(stillRefunded.json?.amount_paid) === 150,
    `paid ${stillRefunded.json?.amount_paid}`,
  );

  // By now this clinic has done both kinds of refund: credit handed back when
  // the plan was abandoned, and money taken off a named bill. They are
  // different events and the income report has to show them apart, while
  // total_refunded keeps meaning both together.
  const split = await api('GET', '/billing/summary', as);
  const onInvoices = num(split.json?.refunds_on_invoices);
  const ofCredit = num(split.json?.refunds_of_credit);
  record(
    'the summary tells an invoice refund apart from credit handed back',
    onInvoices > 0 &&
      ofCredit > 0 &&
      Math.abs(onInvoices + ofCredit - num(split.json?.total_refunded)) < 0.005,
    JSON.stringify({
      on_invoices: onInvoices,
      of_credit: ofCredit,
      total: split.json?.total_refunded,
    }),
  );

  const dropRefund = await api('DELETE', `/billing/payments/${num(refundRow?.payment_id)}`, {
    ...as,
    headers: { ...as.headers, 'x-confirm-password': PASSWORD },
  });
  record(
    'deleting the refund outright still works (its allocation goes with it)',
    dropRefund.status === 200 && num(dropRefund.json?.amount_paid) === 200,
    `status ${dropRefund.status} paid ${dropRefund.json?.amount_paid}`,
  );

  // ── One drawer, both jobs ────────────────────────────────────────────────
  // Naming a bill puts the money on it first. Unlike the old invoice-bound
  // door, more than that bill's balance is not refused: it flows on to their
  // next oldest bill, and only what is left over becomes credit. Its own
  // patient, so the oldest-first rule has exactly two bills to choose between.
  const idsOf = async () =>
    ((await api('GET', '/patients?limit=100', as)).json?.data ?? []).map((p) =>
      num(p.id),
    );
  const beforeSpill = await idsOf();
  await api('POST', '/patients', {
    ...as,
    body: {
      email: `${SLUG}-spill@example.com`,
      first_name: 'Smoke',
      last_name: 'Spill',
    },
  });
  // Identify it by what is new rather than by a field name, so this keeps
  // working whatever shape the patient listing takes.
  const spillPatientId = (await idsOf()).find(
    (id) => !beforeSpill.includes(id),
  );
  const bill = async (amount) =>
    num(
      (
        await api('POST', '/billing/invoices', {
          ...as,
          body: {
            patient_id: spillPatientId,
            procedure_date: day(),
            line_items: [{ procedure_name: 'Filling', amount }],
          },
        })
      ).json?.id,
    );
  const olderBill = await bill(100);
  const namedBill = await bill(100);

  const spill = await api('POST', `/billing/patients/${spillPatientId}/payments`, {
    ...as,
    body: { amount: 150, payment_method: 'cash', invoice_id: namedBill },
  });
  const namedAfter = await api('GET', `/billing/invoices/${namedBill}`, as);
  const olderAfter = await api('GET', `/billing/invoices/${olderBill}`, as);
  record(
    'a payment naming a bill fills it first, then flows on to the next',
    spill.status === 201 &&
      num(namedAfter.json?.amount_paid) === 100 &&
      num(olderAfter.json?.amount_paid) === 50,
    `named ${namedAfter.json?.amount_paid}, older ${olderAfter.json?.amount_paid}`,
  );

  // The same drawer with nothing named is a deposit: it settles what is open
  // oldest first and keeps the rest, which is how a prepayment is taken.
  const heldDeposit = await api('POST', `/billing/patients/${spillPatientId}/payments`, {
    ...as,
    body: { amount: 200, payment_method: 'cash' },
  });
  record(
    'the same drawer with no bill named takes a deposit and holds the change as credit',
    heldDeposit.status === 201 &&
      num(heldDeposit.json?.credit_balance) === 150 &&
      num(heldDeposit.json?.outstanding_balance) === 0,
    `credit ${heldDeposit.json?.credit_balance} owed ${heldDeposit.json?.outstanding_balance}`,
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
