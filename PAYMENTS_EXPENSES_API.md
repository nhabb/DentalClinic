# Payments & Expenses API Documentation

> **Base URL:** `http://localhost:5000/api`  
> **Auth:** All endpoints require `Authorization: Bearer <jwt>` header.  
> **Content-Type:** `application/json`

---

## Frontend Integration Note

> **The `/api/payments/kpis` and `/api/payments/analytics` endpoints are fully implemented and live.**
>
> The 3 KPI dashboard cards and the monthly line chart should be connected to these real endpoints:
>
> | UI Component | Real Endpoint | Query |
> |---|---|---|
> | KPI cards (total income, net profit, collection rate) | `GET /api/payments/kpis` | no params |
> | Monthly line chart | `GET /api/payments/analytics` | `?months=12` (or 6) |
>
> Switch away from any mock/hardcoded data to these endpoints for live clinic financials.

---

## Table of Contents

### Payments
1. [Create Payment Invoice](#1-create-payment-invoice)
2. [List Payments](#2-list-payments)
3. [Get Single Payment](#3-get-single-payment)
4. [Record a Payment (full or partial)](#4-record-a-payment-full-or-partial)
5. [Financial Summary](#5-financial-summary)
6. [Outstanding Payments](#6-outstanding-payments)
7. [Financial KPIs](#7-financial-kpis)
8. [Payments Analytics](#8-payments-analytics)
9. [Aging Report](#9-aging-report)
10. [Per-Patient Financials](#10-per-patient-financials)

### Expenses
11. [Create Expense](#11-create-expense)
12. [List Expenses](#12-list-expenses)
13. [Get Single Expense](#13-get-single-expense)
14. [Update Expense](#14-update-expense)
15. [Delete Expense](#15-delete-expense)
16. [Expenses Analytics](#16-expenses-analytics)

---

# PAYMENTS

## Payment Lifecycle

```
pending  ──(partial payment)──►  partial  ──(full payment)──►  paid
   │                                                             │
   └──────────────────(cancel/refund)────────────────────────►  cancelled / refunded
```

**Status values:**
| Status | Meaning |
|--------|---------|
| `pending` | Invoice created, no payment received yet |
| `partial` | Some money received, balance still outstanding |
| `paid` | Fully settled |
| `refunded` | Payment was reversed |
| `cancelled` | Invoice voided |

---

## 1. Create Payment Invoice

**`POST /payments`**

Creates a new invoice for a patient. The invoice starts with status `pending` and `amount_paid = 0`. Payment is recorded separately via [endpoint #4](#4-record-a-payment-full-or-partial).

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `patient_id` | number | YES | Patient profile ID (also accepts `users.id` as fallback) |
| `amount` | number | YES | Total invoice amount (e.g. `1400.00`) |
| `payment_method` | string | no | `cash` \| `card` \| `insurance` \| `bank_transfer` — default: `cash` |
| `description` | string | no | Treatment description or notes |
| `appointment_id` | number | no | Link to a specific appointment |
| `created_by` | number | no | User ID of the staff member creating this record |

```json
POST /api/payments
{
  "patient_id": 3,
  "amount": 1400.00,
  "payment_method": "cash",
  "description": "Root canal treatment"
}
```

### Response `201 Created`

```json
{
  "id": "42",
  "patient_id": "3",
  "appointment_id": null,
  "amount": "1400.00",
  "amount_paid": "0.00",
  "remaining_balance": 1400,
  "payment_method": "cash",
  "status": "pending",
  "description": "Root canal treatment",
  "paid_at": null,
  "created_by": null,
  "created_at": "2026-04-11T08:00:00.000Z",
  "updated_at": "2026-04-11T08:00:00.000Z",
  "patient": {
    "id": "3",
    "users": {
      "id": "7",
      "first_name": "Sara",
      "last_name": "Ahmed",
      "email": "sara@example.com"
    }
  },
  "appointment": null,
  "creator": null
}
```

---

## 2. List Payments

**`GET /payments`**

Returns a paginated list of payment records with optional filters.

### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `patient_id` | number | Filter by patient profile ID |
| `status` | string | `pending` \| `partial` \| `paid` \| `refunded` \| `cancelled` |
| `from` | string | Start date — `YYYY-MM-DD` (filters on `created_at`) |
| `to` | string | End date — `YYYY-MM-DD` (filters on `created_at`) |
| `page` | number | Page number (default: `1`) |
| `limit` | number | Items per page (default: `20`) |

```
GET /api/payments?status=pending&page=1&limit=10
GET /api/payments?patient_id=3&from=2026-01-01&to=2026-04-30
```

### Response `200 OK`

```json
{
  "data": [
    {
      "id": "42",
      "amount": "1400.00",
      "amount_paid": "150.00",
      "remaining_balance": 1250,
      "status": "partial",
      "payment_method": "cash",
      "description": "Root canal treatment",
      "paid_at": "2026-04-05T10:00:00.000Z",
      "created_at": "2026-04-01T08:00:00.000Z",
      "patient": {
        "id": "3",
        "users": { "first_name": "Sara", "last_name": "Ahmed", "email": "sara@example.com" }
      },
      "appointment": null,
      "creator": null
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

## 3. Get Single Payment

**`GET /payments/:id`**

Retrieves full details for one payment record.

```
GET /api/payments/42
```

### Response `200 OK`

Same shape as a single item in `data[]` above, including `remaining_balance`.

### Error `404 Not Found`
```json
{ "statusCode": 404, "message": "Payment not found" }
```

---

## 4. Record a Payment (full or partial)

**`PATCH /payments/:id/status`**

This is the main endpoint for recording money received. Each call **adds** to the running total — it does **not** replace the previous value.

**Example flow:**
1. Invoice created for **1400**
2. Patient pays **150** → `amount_paid = 150`, status → `partial`, `remaining = 1250`
3. Next visit, pays **250** → `amount_paid = 400`, status → `partial`, `remaining = 1000`
4. Final payment **1000** → `amount_paid = 1400`, status → `paid`, `remaining = 0`

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount_paid` | number | Recommended | Amount received **this time**. Status is auto-computed. |
| `status` | string | no | Manual status override — only used when `amount_paid` is NOT provided. Values: `pending` \| `partial` \| `paid` \| `refunded` \| `cancelled` |
| `paid_at` | string | no | ISO 8601 timestamp of when payment was made. Defaults to `now()` |

> **Rule:** If `amount_paid` is provided, the `status` field is ignored — status is computed automatically.

```json
PATCH /api/payments/42/status
{
  "amount_paid": 150,
  "paid_at": "2026-04-05T10:00:00.000Z"
}
```

### Response `200 OK`

```json
{
  "id": "42",
  "amount": "1400.00",
  "amount_paid": "150.00",
  "remaining_balance": 1250,
  "status": "partial",
  "paid_at": "2026-04-05T10:00:00.000Z"
}
```

### Error `400 Bad Request` (overpayment)
```json
{
  "statusCode": 400,
  "message": "Payment of 1500 would exceed remaining balance (1250)"
}
```

### Cancel/Refund (no money involved)
```json
PATCH /api/payments/42/status
{
  "status": "cancelled"
}
```

---

## 5. Financial Summary

**`GET /payments/summary`**

Returns total income, total expenses, and net profit. Optionally filtered by date range.

- **Income** = sum of `amount_paid` for invoices with status `paid`
- **Expenses** = sum of all expense records
- **Net** = income − expenses

### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `from` | string | Start date `YYYY-MM-DD` (applies to `paid_at` for payments, `expense_date` for expenses) |
| `to` | string | End date `YYYY-MM-DD` |

```
GET /api/payments/summary
GET /api/payments/summary?from=2026-01-01&to=2026-03-31
```

### Response `200 OK`

```json
{
  "total_income": 48500.00,
  "total_expenses": 12300.00,
  "net": 36200.00,
  "payments_count": 85,
  "expenses_count": 14,
  "period": {
    "from": "2026-01-01",
    "to": "2026-03-31"
  }
}
```
> `period` is only included when at least one date filter is provided.

---

## 6. Outstanding Payments

**`GET /payments/outstanding`**

Returns all invoices that have not been fully paid (status `pending` or `partial`), sorted oldest-first. Used to identify patients with unpaid balances.

```
GET /api/payments/outstanding
```

### Response `200 OK`

```json
[
  {
    "id": "42",
    "amount": 1400,
    "amount_paid": 150,
    "remaining_balance": 1250,
    "status": "partial",
    "payment_method": "cash",
    "created_at": "2026-04-01T08:00:00.000Z",
    "patient": {
      "id": "3",
      "users": { "first_name": "Sara", "last_name": "Ahmed", "email": "sara@example.com" }
    }
  }
]
```

---

## 7. Financial KPIs

**`GET /payments/kpis`**

> **STATUS: LIVE** — This endpoint is fully implemented. Connect the 3 KPI dashboard cards here.

All-time key performance indicators plus this-month vs. last-month comparison and growth percentages.

```
GET /api/payments/kpis
```

### Response `200 OK`

```json
{
  "all_time": {
    "total_billed": 125000.00,
    "total_collected": 98500.00,
    "total_outstanding": 26500.00,
    "total_expenses": 34200.00,
    "net_profit": 64300.00,
    "collection_rate_pct": 78.8,
    "average_invoice": 312.50,
    "total_invoices": 400
  },
  "this_month": {
    "income": 8200.00,
    "expenses": 2100.00,
    "net": 6100.00,
    "invoices": 27
  },
  "last_month": {
    "income": 7500.00,
    "expenses": 1800.00,
    "net": 5700.00,
    "invoices": 24
  },
  "growth": {
    "income_pct": 9.3,
    "expenses_pct": 16.7,
    "net_pct": 7.0
  }
}
```

**How to map to the 3 KPI cards:**

| Card | Field to use |
|------|-------------|
| Total Income / Revenue | `all_time.total_collected` or `this_month.income` |
| Net Profit | `all_time.net_profit` or `this_month.net` |
| Collection Rate | `all_time.collection_rate_pct` (shown as %) |

**Growth arrow direction:** `growth.income_pct > 0` → green up arrow, `< 0` → red down arrow. `null` means no data for last month.

---

## 8. Payments Analytics

**`GET /payments/analytics`**

> **STATUS: LIVE** — This endpoint is fully implemented. Connect the monthly line chart here.

Monthly income/expense trends, payment method breakdown, and status distribution.

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `months` | number | `12` | How many past months to include |

```
GET /api/payments/analytics?months=12
GET /api/payments/analytics?months=6
```

### Response `200 OK`

```json
{
  "period_months": 6,
  "totals": {
    "income": 48500.00,
    "expenses": 12300.00,
    "net": 36200.00,
    "outstanding": 9800.00
  },
  "monthly": [
    { "month": "2025-11", "income": 7200.00, "expenses": 1800.00, "net": 5400.00 },
    { "month": "2025-12", "income": 8500.00, "expenses": 2200.00, "net": 6300.00 },
    { "month": "2026-01", "income": 7800.00, "expenses": 1900.00, "net": 5900.00 },
    { "month": "2026-02", "income": 8100.00, "expenses": 2100.00, "net": 6000.00 },
    { "month": "2026-03", "income": 8700.00, "expenses": 2300.00, "net": 6400.00 },
    { "month": "2026-04", "income": 8200.00, "expenses": 2000.00, "net": 6200.00 }
  ],
  "by_payment_method": {
    "cash": 22000.00,
    "card": 18500.00,
    "insurance": 6000.00,
    "bank_transfer": 2000.00
  },
  "by_status": {
    "paid": 78,
    "partial": 12,
    "pending": 8,
    "cancelled": 2
  },
  "expenses_by_category": {
    "rent": 6000.00,
    "utilities": 2400.00,
    "supplies": 2100.00,
    "equipment": 1200.00,
    "maintenance": 600.00
  }
}
```

**How to map to the line chart:**

- X axis: `monthly[].month` (format as `"Nov '25"`, `"Dec '25"`, etc.)
- Income line: `monthly[].income`
- Expenses line: `monthly[].expenses`
- Net profit line: `monthly[].net` (optional third line)

> `monthly` is always sorted oldest → newest and includes every month in the range (even months with zero activity, shown as `0`).

---

## 9. Aging Report

**`GET /payments/aging`**

Accounts-receivable aging: outstanding debt bucketed by how many days have passed since the invoice was created.

```
GET /api/payments/aging
```

### Response `200 OK`

```json
{
  "0_30_days": {
    "count": 5,
    "total_outstanding": 3200.00,
    "invoices": [
      {
        "id": "42",
        "patient": "Sara Ahmed",
        "amount": 1400.00,
        "amount_paid": 150.00,
        "remaining": 1250.00,
        "status": "partial",
        "created_at": "2026-04-01T08:00:00.000Z"
      }
    ]
  },
  "31_60_days": { "count": 3, "total_outstanding": 4100.00, "invoices": [] },
  "61_90_days": { "count": 1, "total_outstanding": 900.00,  "invoices": [] },
  "90_plus_days": { "count": 2, "total_outstanding": 1600.00, "invoices": [] },
  "total_outstanding": 9800.00
}
```

| Bucket | Days since invoice created | Risk level |
|--------|---------------------------|------------|
| `0_30_days` | 0 – 30 | Low |
| `31_60_days` | 31 – 60 | Moderate |
| `61_90_days` | 61 – 90 | High |
| `90_plus_days` | Over 90 | Critical |

---

## 10. Per-Patient Financials

**`GET /payments/patients/report`**

Per-patient financial summary. Sorted by total billed descending.

### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `patient_id` | number | Filter to a single patient. Omit to get all patients. |

```
GET /api/payments/patients/report
GET /api/payments/patients/report?patient_id=3
```

### Response `200 OK`

```json
[
  {
    "patient_id": "3",
    "name": "Sara Ahmed",
    "email": "sara@example.com",
    "total_billed": 2800.00,
    "total_paid": 1550.00,
    "outstanding": 1250.00,
    "invoices": 2,
    "last_payment": "2026-04-05T10:00:00.000Z",
    "collection_rate_pct": 55.4
  }
]
```

---

---

# EXPENSES

## Expense Categories

| Value | Description |
|-------|-------------|
| `utilities` | Electricity, water, internet, phone |
| `rent` | Clinic rent or lease payments |
| `equipment` | Dental equipment purchases or leasing |
| `supplies` | Consumables: gloves, masks, dental materials |
| `maintenance` | Repairs and servicing |
| `other` | Anything that doesn't fit the above |

---

## 11. Create Expense

**`POST /expenses`**

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | YES | Short label (max 255 chars). E.g. `"Electricity bill April"` |
| `amount` | number | YES | Expense amount |
| `expense_date` | string | YES | Date of expense — `YYYY-MM-DD` |
| `category` | string | no | Category value — default: `other` |
| `description` | string | no | Additional details |
| `created_by` | number | no | User ID of the staff member recording it |

```json
POST /api/expenses
{
  "title": "Electricity bill April",
  "category": "utilities",
  "amount": 350.00,
  "expense_date": "2026-04-10"
}
```

### Response `201 Created`

```json
{
  "id": "18",
  "title": "Electricity bill April",
  "category": "utilities",
  "amount": "350.00",
  "description": null,
  "expense_date": "2026-04-10T00:00:00.000Z",
  "created_by": null,
  "created_at": "2026-04-11T09:00:00.000Z",
  "updated_at": "2026-04-11T09:00:00.000Z",
  "creator": null
}
```

---

## 12. List Expenses

**`GET /expenses`**

### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category |
| `from` | string | Start date `YYYY-MM-DD` (filters on `expense_date`) |
| `to` | string | End date `YYYY-MM-DD` |
| `page` | number | Default: `1` |
| `limit` | number | Default: `20` |

```
GET /api/expenses?category=utilities&from=2026-01-01
```

### Response `200 OK`

```json
{
  "data": [
    {
      "id": "18",
      "title": "Electricity bill April",
      "category": "utilities",
      "amount": "350.00",
      "expense_date": "2026-04-10T00:00:00.000Z",
      "created_at": "2026-04-11T09:00:00.000Z",
      "creator": { "id": "2", "first_name": "Admin", "last_name": "User" }
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

## 13. Get Single Expense

**`GET /expenses/:id`**

```
GET /api/expenses/18
```

Returns single expense object. `404` if not found.

---

## 14. Update Expense

**`PATCH /expenses/:id`**

All fields optional — only send what you want to change.

```json
PATCH /api/expenses/18
{
  "amount": 380.00,
  "description": "Corrected after re-reading the meter"
}
```

Returns updated expense object. `404` if not found.

---

## 15. Delete Expense

**`DELETE /expenses/:id`**

Permanently removes the record. Returns the deleted object. `404` if not found.

```
DELETE /api/expenses/18
```

---

## 16. Expenses Analytics

**`GET /expenses/analytics`**

Monthly expense totals and breakdown by category.

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `months` | number | `12` | How many past months to include |

```
GET /api/expenses/analytics?months=6
```

### Response `200 OK`

```json
{
  "period_months": 6,
  "total": 12300.00,
  "monthly": [
    { "month": "2025-11", "amount": 1800.00 },
    { "month": "2025-12", "amount": 2200.00 },
    { "month": "2026-01", "amount": 1900.00 },
    { "month": "2026-02", "amount": 2100.00 },
    { "month": "2026-03", "amount": 2300.00 },
    { "month": "2026-04", "amount": 2000.00 }
  ],
  "by_category": [
    { "category": "rent",        "total": 6000.00, "count": 6 },
    { "category": "utilities",   "total": 2400.00, "count": 6 },
    { "category": "supplies",    "total": 2100.00, "count": 12 },
    { "category": "equipment",   "total": 1200.00, "count": 2 },
    { "category": "maintenance", "total": 600.00,  "count": 3 }
  ]
}
```

> `by_category` is sorted by `total` descending (biggest spender first).

---

# Common Patterns

## Pagination

All list endpoints return:

```json
{
  "data": [...],
  "meta": { "total": 85, "page": 1, "limit": 20, "totalPages": 5 }
}
```

## Date Formats

| Context | Format | Example |
|---------|--------|---------|
| Date filters (`from`, `to`) | `YYYY-MM-DD` | `2026-04-01` |
| `expense_date` field | `YYYY-MM-DD` | `2026-04-10` |
| `paid_at` field | ISO 8601 | `2026-04-05T10:00:00.000Z` |
| Timestamps in responses | ISO 8601 | `2026-04-11T09:00:00.000Z` |

## ID Fields

IDs are returned as **strings** in responses (PostgreSQL BigInt). Send them as **numbers** in request bodies.

## Error Responses

```json
{ "statusCode": 400, "message": "Descriptive error", "error": "Bad Request" }
```

| Code | Meaning |
|------|---------|
| `400` | Validation error or business rule violation (e.g. overpayment) |
| `401` | Missing or invalid JWT |
| `404` | Record not found |
| `500` | Unexpected server error |

---

# Quick Reference

## Payments Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `POST` | `/payments` | Create invoice | Live |
| `GET` | `/payments` | List with filters | Live |
| `GET` | `/payments/:id` | Single invoice | Live |
| `PATCH` | `/payments/:id/status` | Record payment / change status | Live |
| `GET` | `/payments/summary` | Income + expenses + net | Live |
| `GET` | `/payments/outstanding` | Unpaid invoices | Live |
| `GET` | `/payments/kpis` | **Dashboard KPI cards** | **Live** |
| `GET` | `/payments/analytics` | **Monthly line chart data** | **Live** |
| `GET` | `/payments/aging` | AR aging buckets | Live |
| `GET` | `/payments/patients/report` | Per-patient financials | Live |

## Expenses Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `POST` | `/expenses` | Create expense | Live |
| `GET` | `/expenses` | List with filters | Live |
| `GET` | `/expenses/:id` | Single expense | Live |
| `PATCH` | `/expenses/:id` | Update expense | Live |
| `DELETE` | `/expenses/:id` | Delete expense | Live |
| `GET` | `/expenses/analytics` | Monthly trends + by category | Live |
