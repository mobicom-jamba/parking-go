import { getEnv, requireEnv } from './env.js';

const DEFAULT_QPAY_BASE_URL = 'https://merchant.qpay.mn';

type QPayUrlItem = {
  name: string;
  description?: string;
  link: string;
};

export type QPayInvoiceCreateResponse = {
  invoice_id: string;
  qr_text: string;
  qr_image: string; // Base64 (without data URL prefix)
  urls: QPayUrlItem[];
};

type QPayPaymentCheckRow = {
  payment_id: string;
  payment_status: string; // NEW/FAILED/PAID/REFUNDED (doc)
};

type QPayPaymentCheckResponse = {
  count: number;
  paid_amount?: number;
  rows?: QPayPaymentCheckRow[];
};

function getQpayBaseUrl() {
  return getEnv('QPAY_BASE_URL') ?? DEFAULT_QPAY_BASE_URL;
}

function parseMaybeJson(bodyText: string) {
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

function pickTokenFromPayload(payload: any, fallbackText?: string) {
  if (!payload) return fallbackText;
  if (typeof payload === 'string') return payload || fallbackText;
  return (
    payload.access_token ||
    payload.token ||
    payload.jwt ||
    payload.data?.access_token ||
    payload.data?.token ||
    fallbackText
  );
}

export async function qpayGetAccessToken() {
  // Token retrieval rule from you: do NOT cache across calls.
  // Always request a fresh token and use it immediately.
  const username = requireEnv('QPAY_USERNAME');
  const password = requireEnv('QPAY_PASSWORD');

  const baseUrl = getQpayBaseUrl();
  const url = `${baseUrl}/v2/auth/token`;

  const { Buffer } = globalThis as any;
  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`QPay token request failed: ${res.status} ${bodyText}`);
  }

  const parsed = parseMaybeJson(bodyText);
  const token = pickTokenFromPayload(parsed, bodyText)?.toString().trim();

  if (!token) throw new Error(`QPay token response did not include a token: ${bodyText}`);
  return token;
}

export async function qpayCreateInvoice(params: {
  invoiceCode: string;
  senderInvoiceNo: string;
  invoiceReceiverCode: string;
  senderBranchCode: string;
  invoiceDescription: string;
  amount: number;
  callbackUrl: string;
  // keep this minimal; you can extend when needed
  enableExpiry?: boolean;
  allowPartial?: boolean;
}) {
  const token = await qpayGetAccessToken();
  const baseUrl = getQpayBaseUrl();

  const url = `${baseUrl}/v2/invoice`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      invoice_code: params.invoiceCode,
      sender_invoice_no: params.senderInvoiceNo,
      invoice_receiver_code: params.invoiceReceiverCode,
      sender_branch_code: params.senderBranchCode,
      invoice_description: params.invoiceDescription,
      enable_expiry: params.enableExpiry ?? false,
      allow_partial: params.allowPartial ?? false,
      amount: params.amount,
      callback_url: params.callbackUrl,
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`QPay invoice create failed: ${res.status} ${bodyText}`);
  }

  const parsed = parseMaybeJson(bodyText);
  if (!parsed) {
    throw new Error(`QPay invoice create returned non-JSON body: ${bodyText}`);
  }

  // Doc field names:
  // invoice_id, qr_text, qr_image, urls
  return parsed as QPayInvoiceCreateResponse;
}

export async function qpayCheckInvoice(params: { objectId: string }) {
  const token = await qpayGetAccessToken();
  const baseUrl = getQpayBaseUrl();

  const url = `${baseUrl}/v2/payment/check`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      object_type: 'INVOICE',
      object_id: params.objectId,
      offset: {
        page_number: 1,
        page_limit: 100,
      },
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`QPay payment/check failed: ${res.status} ${bodyText}`);
  }

  const parsed = parseMaybeJson(bodyText);
  return parsed as QPayPaymentCheckResponse;
}

