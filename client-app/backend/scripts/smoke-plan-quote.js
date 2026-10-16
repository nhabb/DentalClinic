/**
 * The flow asked for: plan and price on the chart, the quote builds itself
 * and keeps following the plan, confirmation is a human step, and billing
 * reads by quote and treatment.
 */
const { api, login } = require('./lib/smoke-helpers');

const rows = [];
const rec = (c, ok, d = '') => rows.push({ check: c, ok: ok ? 'PASS' : 'FAIL', detail: d });
const num = (v) => Number(v ?? 0);
const today = () => new Date().toISOString().slice(0, 10);

(async () => {
  const doctor = await login('doctor@demo.com', 'demo123');
  const as = { token: doctor.token };

  // A throwaway patient so the run is repeatable.
  const stamp = Date.now();
  const created = await api('POST', '/patients', {
    ...as,
    body: {
      email: `plan-quote-${stamp}@example.com`,
      first_name: 'Plan',
      last_name: 'Quote',
      phone: '+961 70 000 000',
    },
  });
  const patientId = num(created.json?.id);
  rec('throwaway patient created', created.status === 201 && patientId > 0, `status ${created.status}`);

  const quoteFor = async () => {
    const res = await api('GET', `/quotes?patient_id=${patientId}&limit=10`, as);
    const open = (res.json?.data ?? []).filter((q) =>
      ['draft', 'sent', 'accepted'].includes(q.status),
    );
    return open[0] ?? null;
  };

  // 1. Plan priced work on the chart.
  const planned = await api('POST', '/patient-work', {
    ...as,
    body: {
      patient_id: patientId,
      treatment_date: today(),
      items: [
        { tooth_number: '11', procedure_name: 'Crown', status: 'planned', amount: 250 },
        { tooth_number: '21', procedure_name: 'Crown', status: 'planned', amount: 250 },
      ],
    },
  });
  rec('plan two crowns with prices', planned.status === 201, `status ${planned.status}`);

  let q = await quoteFor();
  rec('a quote built itself from the plan', !!q, q ? `${q.quote_number} ${q.status}` : 'none');
  rec('it is a draft, waiting to be confirmed', q?.status === 'draft', `status ${q?.status}`);
  rec('its total is the plan (250 + 250)', num(q?.quoted_total) === 500, `total ${q?.quoted_total}`);

  // 2. Add work to the plan: the quote follows.
  const more = await api('POST', '/patient-work', {
    ...as,
    body: {
      patient_id: patientId,
      treatment_date: today(),
      items: [
        { tooth_number: '36', procedure_name: 'Root Canal', status: 'planned', amount: 200 },
      ],
    },
  });
  q = await quoteFor();
  rec(
    'adding to the plan changes the quote automatically (700)',
    more.status === 201 && num(q?.quoted_total) === 700,
    `total ${q?.quoted_total}`,
  );
  rec('and it is still the same quote, not a new one', (q?.items ?? []).length === 3, `${q?.items?.length} lines`);

  // 3. Reprice one planned treatment on the chart: the quote follows.
  const chart = await api('GET', `/patient-work/chart/${patientId}`, as);
  const crown = (chart.json?.history ?? []).find((r) => r.tooth_number === '11');
  const repriced = await api('PATCH', `/patient-work/records/${num(crown?.id)}/price`, {
    ...as,
    body: { amount: 400 },
  });
  q = await quoteFor();
  rec(
    'repricing a planned treatment changes the quote (850)',
    repriced.status === 200 && num(q?.quoted_total) === 850,
    `status ${repriced.status} total ${q?.quoted_total}`,
  );

  // 4. Confirm it: a human step.
  const accepted = await api('POST', `/quotes/${num(q?.id)}/accept`, as);
  rec('the quote is confirmed by a person', accepted.json?.status === 'accepted', `status ${accepted.status}`);

  // 5. It keeps following the plan after acceptance, as asked.
  const afterAccept = await api('POST', '/patient-work', {
    ...as,
    body: {
      patient_id: patientId,
      treatment_date: today(),
      items: [
        { tooth_number: '46', procedure_name: 'Filling', status: 'planned', amount: 50 },
      ],
    },
  });
  q = await quoteFor();
  rec(
    'changing the plan after acceptance still updates the quote (900)',
    afterAccept.status === 201 && num(q?.quoted_total) === 900,
    `total ${q?.quoted_total} status ${q?.status}`,
  );

  // 6. Dropping planned work shrinks it again.
  const filling = (await api('GET', `/patient-work/chart/${patientId}`, as)).json.history.find(
    (r) => r.tooth_number === '46',
  );
  await api('DELETE', `/patient-work/records/${num(filling?.id)}`, as);
  q = await quoteFor();
  rec('removing planned work shrinks the quote (850)', num(q?.quoted_total) === 850, `total ${q?.quoted_total}`);

  // 7. Complete the work, then bill it: billing reads by quote and treatment.
  const toComplete = (await api('GET', `/patient-work/chart/${patientId}`, as)).json.history
    .filter((r) => r.record_type === 'treatment_plan')
    .map((r) => ({ record_id: num(r.id) }));
  await api('POST', '/patient-work/complete', {
    ...as,
    body: { patient_id: patientId, items: toComplete },
  });

  const billable = await api('GET', `/billing/patients/${patientId}/billable`, as);
  const groups = billable.json?.quoted ?? [];
  rec(
    'the billing page groups the work under its quote',
    groups.length === 1 && (groups[0].items ?? []).length === 3,
    `${groups.length} quote group(s), ${(groups[0]?.items ?? []).length} treatments`,
  );
  rec(
    'and prices each treatment at what the quote agreed',
    (billable.json?.completed_unbilled ?? []).some((r) => num(r.quoted_amount) === 400),
    `prices ${(billable.json?.completed_unbilled ?? []).map((r) => r.quoted_amount).join(', ')}`,
  );

  // 8. Bill it, then prove the billed quote is frozen against plan changes.
  const lines = (billable.json?.completed_unbilled ?? []).map((r) => ({
    record_id: r.id,
    procedure_name: r.title,
    ...(r.tooth_number ? { tooth_number: r.tooth_number } : {}),
    amount: num(r.quoted_amount),
  }));
  const invoice = await api('POST', '/billing/invoices', {
    ...as,
    body: { patient_id: patientId, procedure_date: today(), line_items: lines },
  });
  rec('the invoice bills the quoted treatments', invoice.status === 201 && num(invoice.json?.total_amount) === 850,
      `status ${invoice.status} total ${invoice.json?.total_amount}`);

  const billedQuote = await api('GET', `/quotes/${num(q?.id)}`, as);
  const totalBefore = num(billedQuote.json?.quoted_total);
  await api('POST', '/patient-work', {
    ...as,
    body: {
      patient_id: patientId,
      treatment_date: today(),
      items: [{ tooth_number: '16', procedure_name: 'Veneers', status: 'planned', amount: 300 }],
    },
  });
  const after = await api('GET', `/quotes/${num(q?.id)}/`.replace(/\/$/, ''), as);
  rec(
    'a quote that was billed is left alone by later plan changes',
    num(after.json?.quoted_total) === totalBefore,
    `${totalBefore} -> ${after.json?.quoted_total}`,
  );
  const fresh = await quoteFor();
  rec(
    'and the new planned work starts a fresh draft instead',
    !!fresh && num(fresh.id) !== num(q?.id) && fresh.status === 'draft',
    fresh ? `${fresh.quote_number} ${fresh.status} total ${fresh.quoted_total}` : 'none',
  );
})()
  .then(() => {
    console.table(rows);
    const f = rows.filter((r) => r.ok === 'FAIL').length;
    console.log(f ? `${f} check(s) FAILED` : `all ${rows.length} checks passed`);
    process.exit(f ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
