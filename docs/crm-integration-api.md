# CRM Integration API — Accepted Proposal to Portal Order

**Version:** 1.0
**Date:** 2026-04-10
**Status:** Specification (not yet implemented)

---

## Overview

This API allows the CETHOS CRM to push accepted proposals into the portal, creating a customer (if new), a quote, and an order in a single call. It is implemented as a Supabase Edge Function secured with an API key.

**Base URL:**

```
https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/crm-create-order
```

---

## Authentication

All requests must include an API key in the header:

```
x-api-key: <CRM_API_KEY>
```

The API key is stored as a Supabase Edge Function secret (`CRM_API_KEY`). Requests without a valid key receive `401 Unauthorized`.

---

## Endpoints

### 1. Create Order from Accepted Proposal

**`POST /crm-create-order`**

Creates a customer (or matches an existing one), generates a quote and order, and optionally uploads file references.

#### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `application/json` |
| `x-api-key` | Yes | CRM integration API key |

#### Request Body

```json
{
  "action": "create_order",
  "proposal_id": "CRM-2026-00451",
  "customer": {
    "email": "jasmeen@example.com",
    "full_name": "Jasmeen Kaur",
    "phone": "+1-416-555-1234",
    "customer_type": "individual",
    "company_name": null
  },
  "source_language": "fr",
  "target_language": "en",
  "intended_use": "immigration",
  "country_of_issue": "CA",
  "documents": [
    {
      "filename": "birth_certificate.pdf",
      "document_type": "Birth Certificate",
      "page_count": 2,
      "word_count": 320
    },
    {
      "filename": "marriage_certificate.pdf",
      "document_type": "Marriage Certificate",
      "page_count": 1,
      "word_count": 180
    }
  ],
  "pricing": {
    "subtotal": 195.00,
    "certification_total": 40.00,
    "rush_fee": 0,
    "delivery_fee": 0,
    "tax_rate": 0.13,
    "tax_amount": 30.55,
    "total": 265.55,
    "currency": "CAD"
  },
  "payment": {
    "status": "paid",
    "method": "cheque",
    "reference_number": "003119",
    "amount_paid": 265.55,
    "paid_at": "2026-04-10T14:30:00Z"
  },
  "turnaround_type": "standard",
  "special_instructions": "Customer needs notarized copies",
  "crm_metadata": {
    "proposal_url": "https://crm.cethos.com/proposals/CRM-2026-00451",
    "sales_rep": "Sarah L.",
    "accepted_at": "2026-04-10T14:00:00Z"
  }
}
```

#### Field Reference

##### Top-level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | Must be `"create_order"` |
| `proposal_id` | string | Yes | Unique proposal ID from CRM (stored for traceability) |
| `customer` | object | Yes | Customer info (see below) |
| `source_language` | string | Yes | ISO 639-1 code (e.g. `"fr"`, `"zh"`, `"ar"`) |
| `target_language` | string | Yes | ISO 639-1 code (e.g. `"en"`) |
| `intended_use` | string | No | Intended use code: `"immigration"`, `"legal"`, `"academic"`, `"personal"`, `"business"` |
| `country_of_issue` | string | No | ISO 3166-1 alpha-2 country code |
| `documents` | array | No | List of documents (see below) |
| `pricing` | object | Yes | Pricing breakdown (see below) |
| `payment` | object | No | Payment info if already paid (see below) |
| `turnaround_type` | string | No | `"standard"` (default), `"rush"`, or `"same_day"` |
| `special_instructions` | string | No | Free-text notes |
| `crm_metadata` | object | No | Arbitrary metadata stored as JSONB |

##### `customer` Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Customer email (used to match existing customers) |
| `full_name` | string | Yes | Full name |
| `phone` | string | No | Phone number |
| `customer_type` | string | No | `"individual"` (default) or `"business"` |
| `company_name` | string | No | Required if `customer_type` is `"business"` |

**Customer matching:** If a customer with the same email already exists, the existing record is used. No fields are overwritten on existing customers.

##### `documents[]` Array

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filename` | string | Yes | Original filename |
| `document_type` | string | No | e.g. `"Birth Certificate"`, `"Diploma"` |
| `page_count` | integer | No | Number of pages |
| `word_count` | integer | No | Total word count |

Documents are recorded as metadata on the quote. Actual file uploads should be done separately via the portal's file upload flow or a future `upload_document` action.

##### `pricing` Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subtotal` | number | Yes | Pre-tax subtotal |
| `certification_total` | number | No | Total certification fees (default `0`) |
| `rush_fee` | number | No | Rush fee (default `0`) |
| `delivery_fee` | number | No | Delivery fee (default `0`) |
| `tax_rate` | number | Yes | Tax rate as decimal (e.g. `0.13` for 13%) |
| `tax_amount` | number | Yes | Calculated tax amount |
| `total` | number | Yes | Grand total including tax |
| `currency` | string | No | `"CAD"` (default). `"USD"` also supported. |

##### `payment` Object (Optional)

If omitted, the order is created with `balance_due` equal to `pricing.total`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | `"paid"`, `"partial"`, or `"unpaid"` |
| `method` | string | No | Payment method code: `"cash"`, `"cheque"`, `"etransfer"`, `"terminal"`, `"online"`, `"invoice"` |
| `reference_number` | string | No | Cheque number, e-transfer ref, etc. |
| `amount_paid` | number | No | Amount paid (required if `status` is `"paid"` or `"partial"`) |
| `paid_at` | string | No | ISO 8601 timestamp |

#### Success Response

**Status:** `200 OK`

```json
{
  "success": true,
  "action": "order_created",
  "customer_id": "a1b2c3d4-...",
  "customer_is_new": false,
  "quote_id": "e5f6g7h8-...",
  "quote_number": "QT-2026-01234",
  "order_id": "i9j0k1l2-...",
  "order_number": "ORD-2026-01234",
  "invoice_id": "m3n4o5p6-...",
  "invoice_number": "INV-2026-001234",
  "payment_id": "q7r8s9t0-...",
  "proposal_id": "CRM-2026-00451",
  "total": 265.55,
  "balance_due": 0,
  "portal_url": "https://portal.cethos.com/admin/orders/i9j0k1l2-..."
}
```

#### Error Responses

**Status:** `400 Bad Request`

```json
{
  "success": false,
  "error": "source_language 'xx' not found in languages table"
}
```

**Status:** `401 Unauthorized`

```json
{
  "success": false,
  "error": "Invalid or missing API key"
}
```

**Status:** `409 Conflict`

```json
{
  "success": false,
  "error": "Proposal CRM-2026-00451 already imported as order ORD-2026-01234"
}
```

**Status:** `500 Internal Server Error`

```json
{
  "success": false,
  "error": "Database error: <message>"
}
```

---

### 2. Check Proposal Status

**`POST /crm-create-order`**

Check whether a proposal has already been imported.

#### Request Body

```json
{
  "action": "check_proposal",
  "proposal_id": "CRM-2026-00451"
}
```

#### Success Response

```json
{
  "success": true,
  "exists": true,
  "order_id": "i9j0k1l2-...",
  "order_number": "ORD-2026-01234",
  "order_status": "pending",
  "created_at": "2026-04-10T14:30:00Z"
}
```

If not found:

```json
{
  "success": true,
  "exists": false
}
```

---

### 3. List Imported Proposals

**`POST /crm-create-order`**

Retrieve a paginated list of orders created via CRM integration.

#### Request Body

```json
{
  "action": "list_crm_orders",
  "limit": 25,
  "offset": 0,
  "date_from": "2026-04-01",
  "date_to": "2026-04-10"
}
```

#### Success Response

```json
{
  "success": true,
  "orders": [
    {
      "order_id": "i9j0k1l2-...",
      "order_number": "ORD-2026-01234",
      "proposal_id": "CRM-2026-00451",
      "customer_name": "Jasmeen Kaur",
      "total_amount": 265.55,
      "balance_due": 0,
      "status": "pending",
      "created_at": "2026-04-10T14:30:00Z"
    }
  ],
  "total": 1
}
```

---

### 4. List Languages

**`POST /crm-create-order`**

Returns all active languages with their codes (use `code` value for `source_language` / `target_language` in `create_order`).

#### Request Body

```json
{
  "action": "list_languages"
}
```

#### Success Response

```json
{
  "success": true,
  "languages": [
    {
      "id": "uuid",
      "code": "fr",
      "name": "French",
      "native_name": "Français",
      "tier": 1,
      "multiplier": 1.0,
      "is_source_available": true,
      "is_target_available": true
    }
  ]
}
```

---

### 5. List Services (Intended Uses)

**`POST /crm-create-order`**

Returns all active intended uses/services (use `code` value for `intended_use` in `create_order`).

#### Request Body

```json
{
  "action": "list_services"
}
```

#### Success Response

```json
{
  "success": true,
  "services": [
    {
      "id": "uuid",
      "code": "immigration",
      "name": "Immigration",
      "description": "Documents for immigration applications",
      "subcategory": null
    }
  ]
}
```

---

### 6. List Certification Types

**`POST /crm-create-order`**

Returns all active certification types and their prices.

#### Request Body

```json
{
  "action": "list_certification_types"
}
```

#### Success Response

```json
{
  "success": true,
  "certification_types": [
    {
      "id": "uuid",
      "code": "certified",
      "name": "Certified Translation",
      "description": "Certified by a professional translator",
      "price": 20.00,
      "currency": "CAD"
    }
  ]
}
```

---

## Processing Logic

When `create_order` is called, the edge function performs these steps in order:

1. **Validate API key** — reject if invalid
2. **Deduplicate** — check if `proposal_id` already exists (stored in `orders.crm_proposal_id`); return `409` if so
3. **Resolve customer** — find by email or create new
4. **Resolve languages** — look up `source_language` and `target_language` by ISO code in `languages` table
5. **Resolve intended use** — look up by code in `intended_uses` table (optional)
6. **Create quote** — insert into `quotes` with status `"paid"` and all pricing fields
7. **Create document metadata** — insert into `quote_files` for each document entry (with `upload_status: "pending"` since no actual file is uploaded yet)
8. **Create order** — insert into `orders` linked to the quote, with `status: "pending"`
9. **Create invoice** — insert into `customer_invoices` linked to the order
10. **Record payment** — if `payment` object provided and `amount_paid > 0`, insert into `customer_payments` and allocate to the invoice
11. **Return IDs** — return all created record IDs

---

## Database Changes Required

A new column is needed on the `orders` table to track CRM provenance:

```sql
ALTER TABLE orders ADD COLUMN crm_proposal_id text;
ALTER TABLE orders ADD COLUMN crm_metadata jsonb;
CREATE UNIQUE INDEX idx_orders_crm_proposal_id ON orders (crm_proposal_id) WHERE crm_proposal_id IS NOT NULL;
```

---

## Webhook (Portal to CRM) — Future

To close the loop, the portal can notify the CRM when order status changes. This would be implemented as a database trigger or a periodic sync:

| Event | Payload |
|-------|---------|
| `order.status_changed` | `{ proposal_id, order_number, old_status, new_status, updated_at }` |
| `order.delivered` | `{ proposal_id, order_number, delivered_at, delivery_files[] }` |
| `order.invoice_paid` | `{ proposal_id, order_number, invoice_number, amount_paid, paid_at }` |

The CRM would register a webhook URL, and the portal would POST to it on each event. This is not part of the current scope but documented here for planning.

---

## Rate Limits

| Limit | Value |
|-------|-------|
| Requests per minute | 60 |
| Max payload size | 1 MB |
| Max documents per request | 50 |

---

## Example: cURL

```bash
curl -X POST \
  https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/crm-create-order \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-crm-api-key-here" \
  -d '{
    "action": "create_order",
    "proposal_id": "CRM-2026-00451",
    "customer": {
      "email": "jasmeen@example.com",
      "full_name": "Jasmeen Kaur",
      "phone": "+1-416-555-1234",
      "customer_type": "individual"
    },
    "source_language": "fr",
    "target_language": "en",
    "intended_use": "immigration",
    "documents": [
      {
        "filename": "birth_certificate.pdf",
        "document_type": "Birth Certificate",
        "page_count": 2,
        "word_count": 320
      }
    ],
    "pricing": {
      "subtotal": 130.00,
      "certification_total": 20.00,
      "tax_rate": 0.13,
      "tax_amount": 19.50,
      "total": 169.50
    },
    "payment": {
      "status": "paid",
      "method": "cheque",
      "reference_number": "003119",
      "amount_paid": 169.50,
      "paid_at": "2026-04-10T14:30:00Z"
    }
  }'
```

---

## Example: JavaScript (CRM Integration)

```javascript
async function pushAcceptedProposal(proposal) {
  const response = await fetch(
    "https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1/crm-create-order",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CETHOS_CRM_API_KEY,
      },
      body: JSON.stringify({
        action: "create_order",
        proposal_id: proposal.id,
        customer: {
          email: proposal.client.email,
          full_name: proposal.client.name,
          phone: proposal.client.phone,
          customer_type: proposal.client.is_business ? "business" : "individual",
          company_name: proposal.client.company || null,
        },
        source_language: proposal.source_lang,
        target_language: proposal.target_lang,
        intended_use: proposal.purpose,
        documents: proposal.files.map((f) => ({
          filename: f.name,
          document_type: f.doc_type,
          page_count: f.pages,
          word_count: f.words,
        })),
        pricing: {
          subtotal: proposal.subtotal,
          certification_total: proposal.cert_fees,
          rush_fee: proposal.rush_fee || 0,
          delivery_fee: proposal.delivery_fee || 0,
          tax_rate: proposal.tax_rate,
          tax_amount: proposal.tax,
          total: proposal.total,
        },
        payment: proposal.is_paid
          ? {
              status: "paid",
              method: proposal.payment_method,
              reference_number: proposal.payment_ref,
              amount_paid: proposal.total,
              paid_at: proposal.paid_at,
            }
          : undefined,
        crm_metadata: {
          proposal_url: `https://crm.cethos.com/proposals/${proposal.id}`,
          sales_rep: proposal.rep_name,
          accepted_at: proposal.accepted_at,
        },
      }),
    }
  );

  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data;
}
```
