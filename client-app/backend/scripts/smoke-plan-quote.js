/**
 * The plan is the quote.
 *
 * One living plan per patient, built on the chart, editable all the way
 * through treatment — including after the patient agreed and after part of it
 * has been billed. The only thing that freezes is a line that is on a bill.
 *
 * The previous version of this file asserted the opposite ("planning more work
 * leaves the accepted plan exactly as agreed", "the new work starts a fresh
 * draft of its own"), which is the behaviour that made a plan impossible to
 * change mid-treatment.
 */
const { api, login } = require('./lib/smoke-helpers');

const rows = [];
const rec = (c, ok, d = '') => rows.push({ check: c, ok: ok ? 'PASS' : 'FAIL', detail: d });
const num = (v) => Number(v ?? 0);
const today = () => new Date().toISOString().slice(0, 10);

(async () => {
  const doctor = await login('doctor@demo.com', 'demo123');
  const as = { token: doctor.token };

  const stamp = Date.now();
  const created = await api('POST', '/patients', {
    ...as,
    body: {
      email: `plan-${stamp}@example.com`,
      first_name: 'Plan',
      last_name: 'Living',
      phone: '+961 70 000 000',
    },
  });
  const patientId = num(created.json?.id);
  rec('throwaway patient created', created.status === 201 && patientId > 0, `status ${created.status}`);

  const plan = async () =>
    (await api('GET', `/quotes/patients/${patientId}`, as)).json;

  const addWork = (items) =>
    api('POST', '/patient-work', {
      ...as,
      body: { patient_id: patientId, treatment_date: today(), items },
    });

  // ── 1. The plan is built on the chart ──────────────────────────────────
  const planned = await addWork([
    { tooth_number: '11', procedure_name: 'Crown', status: 'planned', amount: 250 },
    { tooth_number: '21', procedure_name: 'Crown', status: 'planned', amount: 250 },
  ]);
  rec('plan two crowns with prices', planned.status === 201, `status ${planned.status}`);

  let p = await plan();
  rec('the chart work IS the plan, no second list', p?.lines?.length === 2, `${p?.lines?.length} lines`);
  rec('the plan has a number', !!p?.quote_number, `${p?.quote_number}`);
  rec('its total is the plan (250 + 250)', num(p?.totals?.plan) === 500, `total ${p?.totals?.plan}`);
  rec('every line is still only planned', p?.counts?.planned === 2, JSON.stringify(p?.counts));

  // ── 2. Giving it to the patient records what they were handed ──────────
  const send1 = await api('POST', `/quotes/${num(p.quote_id)}/send`, as);
  rec('give the plan to the patient', send1.status === 201, `status ${send1.status}`);
  rec('one dated record of what they were handed', send1.json?.sends?.length === 1,
    `${send1.json?.sends?.length} sends`);

  const accept = await api('POST', `/quotes/${num(p.quote_id)}/accept`, as);
  rec('record that the patient agreed', accept.status === 201 && !!accept.json?.accepted_at,
    `accepted_at ${accept.json?.accepted_at ? 'set' : 'missing'}`);
  rec('the agreement is for the plan as it stands',
    accept.json?.agreement_stale === false, `stale ${accept.json?.agreement_stale}`);

  // ── 3. The plan changes mid-treatment: THE case that was impossible ────
  const added = await addWork([
    { tooth_number: '16', procedure_name: 'Filling', status: 'planned', amount: 120 },
  ]);
  rec('work can be added after the patient agreed', added.status === 201, `status ${added.status}`);

  p = await plan();
  rec('the SAME plan grew; no second plan appeared',
    p?.lines?.length === 3 && num(p?.totals?.plan) === 620,
    `${p?.lines?.length} lines, total ${p?.totals?.plan}`);

  // The agreement was for the plan as it was. It is now for a plan that no
  // longer exists, and the desk has to take it again.
  rec('adding work makes the agreement stale',
    p?.agreement_stale === true, `stale ${p?.agreement_stale}`);
  rec('but the date they first agreed is not thrown away',
    !!p?.accepted_at, `accepted_at ${p?.accepted_at ? 'kept' : 'lost'}`);

  const reAccept = await api('POST', `/quotes/${num(p.quote_id)}/accept`, as);
  rec('agreeing again clears it', reAccept.json?.agreement_stale === false,
    `stale ${reAccept.json?.agreement_stale}`);

  // Repricing is a change to the deal; completing and billing are not.
  const toReprice = p.lines.find((l) => l.tooth === '16');
  await api('PATCH', `/patient-work/records/${num(toReprice.record_id)}/price`, {
    ...as,
    body: { amount: 130 },
  });
  p = await plan();
  rec('repricing a line makes it stale too', p?.agreement_stale === true,
    `stale ${p?.agreement_stale}`);
  await api('POST', `/quotes/${num(p.quote_id)}/accept`, as);
  p = await plan();
  rec('and agreeing again settles it', p?.agreement_stale === false,
    `stale ${p?.agreement_stale}`);

  // ── 4. Bill one line; it freezes, the rest stays editable ──────────────
  const crown = p.lines.find((l) => l.tooth === '11');
  const billed = await api('POST', '/billing/invoices', {
    ...as,
    body: {
      patient_id: patientId,
      procedure_date: today(),
      line_items: [
        { record_id: num(crown.record_id), procedure_name: 'Crown', amount: 250, tooth_number: '11' },
      ],
    },
  });
  rec('bill one line of the plan', billed.status === 201, `status ${billed.status}`);

  p = await plan();
  const billedLine = p.lines.find((l) => num(l.record_id) === num(crown.record_id));
  rec('the billed line stays in the plan, locked, with its price',
    billedLine?.state === 'billed' && billedLine?.locked === true && num(billedLine?.amount) === 250,
    `state ${billedLine?.state} locked ${billedLine?.locked} amount ${billedLine?.amount}`);
  rec('the plan total still covers the whole course of treatment',
    num(p?.totals?.plan) === 630 && num(p?.totals?.billed_value) === 250,
    `plan ${p?.totals?.plan} billed ${p?.totals?.billed_value}`);
  rec('billing the work does NOT demand a fresh agreement',
    p?.agreement_stale === false, `stale ${p?.agreement_stale}`);

  const repriceBilled = await api('PATCH', `/patient-work/records/${num(crown.record_id)}/price`, {
    ...as,
    body: { amount: 400 },
  });
  rec('a billed line cannot be repriced: that price is the invoice’s',
    repriceBilled.status === 400, `status ${repriceBilled.status}`);

  // ── 5. An unbilled line is still repriceable, billed or not ────────────
  const other = p.lines.find((l) => l.tooth === '21');
  const repriceOpen = await api('PATCH', `/patient-work/records/${num(other.record_id)}/price`, {
    ...as,
    body: { amount: 300 },
  });
  rec('an unbilled line can still be repriced mid-treatment', repriceOpen.status === 200,
    `status ${repriceOpen.status}`);

  p = await plan();
  rec('and the plan total moves with it', num(p?.totals?.plan) === 680, `total ${p?.totals?.plan}`);

  // Completing work does not price it, and it stays repriceable until billed.
  const done = await api('POST', '/patient-work/complete', {
    ...as,
    body: { patient_id: patientId, treatment_date: today(), items: [{ record_id: num(other.record_id) }] },
  });
  rec('mark that work done', done.status === 201, `status ${done.status}`);
  const repriceDone = await api('PATCH', `/patient-work/records/${num(other.record_id)}/price`, {
    ...as,
    body: { amount: 320 },
  });
  rec('completed-but-unbilled work is still repriceable', repriceDone.status === 200,
    `status ${repriceDone.status}`);

  // ── 6. Sending again records a second, different figure ────────────────
  const send2 = await api('POST', `/quotes/${num(p.quote_id)}/send`, as);
  const sends = send2.json?.sends ?? [];
  rec('two sendings, two different totals kept',
    sends.length === 2 && num(sends[0].quoted_total) !== num(sends[1].quoted_total),
    sends.map((s) => s.quoted_total).join(' / '));

  // ── 7. Only treatment work is in the plan ──────────────────────────────
  await addWork([{ tooth_number: '31', procedure_name: 'Missing tooth', status: 'missing' }]);
  p = await plan();
  rec('a missing tooth is a finding, not plan work',
    p?.lines?.every((l) => l.procedure !== 'Missing tooth'),
    `${p?.lines?.length} lines`);

  // ── 8. An unpriced line is reported, never counted as free ─────────────
  await addWork([{ tooth_number: '36', procedure_name: 'Filling', status: 'planned' }]);
  p = await plan();
  rec('a line nobody priced is counted, not treated as zero',
    p?.totals?.unpriced_count === 1,
    `unpriced ${p?.totals?.unpriced_count}, total ${p?.totals?.plan}`);

  // ── 9. The statement keeps the money side and the chart side apart ────
  const st = await api(`GET`, `/billing/patients/${patientId}/statement`, as);
  const f = st.json?.figures ?? {};
  const pf = st.json?.plan_figures ?? {};
  rec(`the statement keeps what is owed apart from what is unbilled`,
    st.status === 200 &&
      num(pf.plan_value) === num(p?.totals?.plan) &&
      num(f.billed) === 250 &&
      num(pf.unbilled_value) === num(p?.totals?.plan) - 250,
    `plan ${pf.plan_value} billed ${f.billed} unpaid ${f.due_now} not-yet-billed ${pf.unbilled_value}`);

  // ── 10. The plan says how far the money got ───────────────────────────
  // What the chart could never tell anyone before: a line said "billed" and
  // stopped there, however much of that bill had been paid.
  const invoiceId = num(billed.json?.id);
  const lineNow = async () =>
    (await plan()).lines.find((l) => num(l.record_id) === num(crown.record_id));

  let line = await lineNow();
  rec(`before any payment the billed line reads billed, on an unpaid bill`,
    line?.state === `billed` && line?.invoice_status === `open`,
    `state ${line?.state} invoice ${line?.invoice_status}`);

  const part = await api(`POST`, `/billing/patients/${patientId}/payments`, {
    ...as,
    body: { amount: 100, payment_method: `cash`, invoice_id: invoiceId },
  });
  rec(`take 100 of the 250 owed`, part.status === 201, `status ${part.status}`);
  line = await lineNow();
  rec(`the plan line now reads part paid`,
    line?.state === `part_paid` && line?.invoice_status === `partial`,
    `state ${line?.state} invoice ${line?.invoice_status}`);

  const rest = await api(`POST`, `/billing/patients/${patientId}/payments`, {
    ...as,
    body: { amount: 150, payment_method: `cash`, invoice_id: invoiceId },
  });
  rec(`take the remaining 150`, rest.status === 201, `status ${rest.status}`);
  line = await lineNow();
  rec(`the plan line reads paid, still frozen at the price its bill froze`,
    line?.state === `paid` && line?.locked === true && num(line?.amount) === 250,
    `state ${line?.state} locked ${line?.locked} amount ${line?.amount}`);

  p = await plan();
  rec(`the plan reports its own settlement, counting each bill once`,
    num(p?.settlement?.invoice_count) === 1 &&
      num(p?.settlement?.invoiced_total) === 250 &&
      num(p?.settlement?.received) === 250 &&
      num(p?.settlement?.due) === 0,
    JSON.stringify(p?.settlement));

  // The assertion that answers "the numbers disagree between screens": the
  // chart and the billing page are reading one truth.
  const st2 = await api(`GET`, `/billing/patients/${patientId}/statement`, as);
  const f2 = st2.json?.figures ?? {};
  rec(`the plan and the statement agree on what is unpaid`,
    num(p?.settlement?.due) === num(f2.due_now),
    `plan ${p?.settlement?.due} vs statement ${f2.due_now}`);
  rec(`and the statement still balances: billed - paid = unpaid`,
    Math.abs(num(f2.billed) - num(f2.applied) - num(f2.due_now)) < 0.005 &&
      Math.abs(num(f2.received) - num(f2.applied) - num(f2.credit_held)) < 0.005,
    JSON.stringify(f2));

  rec(`paying is not pricing: the unpriced line is still counted`,
    num(p?.totals?.unpriced_count) === 1,
    `unpriced ${p?.totals?.unpriced_count}`);

  console.table(rows);
  const failed = rows.filter((r) => r.ok === 'FAIL').length;
  console.log(failed ? `${failed} check(s) FAILED` : `all ${rows.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.table(rows);
  console.error('FATAL', err.message);
  process.exit(1);
});
