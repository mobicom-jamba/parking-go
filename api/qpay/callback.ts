import { qpayCheckInvoice } from './_lib/qpayClient.js';
import { getSupabaseServer } from './_lib/supabaseServer.js';

function isoNow() {
  return new Date().toISOString();
}

function normalizePaymentStatus(status: string | undefined) {
  const s = (status ?? '').toUpperCase();
  if (s === 'PAID') return 'success';
  if (s === 'FAILED' || s === 'REFUNDED') return 'failed';
  return 'pending';
}

async function readJsonBody(req: any) {
  if (req?.body && typeof req.body === 'object') return req.body;
  // Some runtimes require reading raw body; try safely.
  try {
    const txt = await req.text?.();
    if (!txt) return {};
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

export default async function handler(req: any, res: any) {
  // QPay callback: will call with payment_id (from docs: "...?payment_id=...").
  // We still support JSON body fallback.
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    const queryPaymentId =
      url.searchParams.get('payment_id') ||
      url.searchParams.get('paymentId') ||
      url.searchParams.get('payment_id'.toUpperCase());

    const body = await readJsonBody(req);
    const bodyPaymentId = body?.payment_id ?? body?.paymentId;

    const paymentId = (queryPaymentId ?? bodyPaymentId) as string | undefined;
    if (!paymentId) {
      res.status(400).json({ error: 'Missing payment_id in callback' });
      return;
    }

    const supabase: any = getSupabaseServer();

    const check = await qpayCheckInvoice({ objectId: paymentId });
    const firstRow = check?.rows?.[0];
    const normalized = normalizePaymentStatus(firstRow?.payment_status);

    const nowIso = isoNow();

    // Find pending payment record by transaction_id.
    // Primary: transaction_id == callback paymentId.
    let paymentRow: { id: string; case_id: string } | null = null;
    {
      const { data, error } = await supabase
      .from('payments')
      .select('id, case_id')
      .eq('provider', 'qpay')
      .eq('transaction_id', paymentId)
      .eq('payment_status', 'pending')
      .limit(1)
      .maybeSingle();
      if (error) throw error;
      paymentRow = data;
    }

    // Fallback: some integrations may treat callback id and check/payment_id differently.
    if (!paymentRow && firstRow?.payment_id) {
      const { data, error } = await supabase
        .from('payments')
        .select('id, case_id')
        .eq('provider', 'qpay')
        .eq('transaction_id', firstRow.payment_id)
        .eq('payment_status', 'pending')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      paymentRow = data;
    }

    // If we can't match the payment row, we still return 200 so QPay doesn't retry endlessly.
    if (!paymentRow) {
      res.status(200).json({ ok: true, payment_status: normalized, matched: false });
      return;
    }

    if (normalized === 'success') {
      const { error: paymentUpdateError } = await supabase
        .from('payments')
        .update({ payment_status: 'success', paid_at: nowIso })
        .eq('id', paymentRow.id)
        .eq('payment_status', 'pending');
      if (paymentUpdateError) throw paymentUpdateError;

      const { error: caseUpdateError } = await supabase
        .from('parking_cases')
        .update({
          status: 'PAID',
          status_updated_at: nowIso,
          paid_at: nowIso,
        })
        .eq('id', paymentRow.case_id);
      if (caseUpdateError) throw caseUpdateError;

      await supabase.from('audit_logs').insert({
        actor_name: 'QPay callback',
        actor_role: 'worker',
        case_id: paymentRow.case_id,
        action: 'PAYMENT_QPAY_CALLBACK_PAID',
        before_status: 'PENDING_PAYMENT',
        after_status: 'PAID',
        metadata: { payment_id: firstRow?.payment_id ?? paymentId },
      });

      res.status(200).json({ ok: true, payment_status: 'success' });
      return;
    }

    if (normalized === 'failed') {
      const { error: paymentUpdateError } = await supabase
        .from('payments')
        .update({ payment_status: 'failed', failed_at: nowIso })
        .eq('id', paymentRow.id)
        .eq('payment_status', 'pending');
      if (paymentUpdateError) throw paymentUpdateError;

      await supabase.from('parking_cases').update({
        status: 'IMPOUNDED',
        status_updated_at: nowIso,
        paid_at: null,
      }).eq('id', paymentRow.case_id);

      await supabase.from('audit_logs').insert({
        actor_name: 'QPay callback',
        actor_role: 'worker',
        case_id: paymentRow.case_id,
        action: 'PAYMENT_QPAY_CALLBACK_FAILED',
        before_status: 'PENDING_PAYMENT',
        after_status: 'IMPOUNDED',
        metadata: { payment_id: firstRow?.payment_id ?? paymentId },
      });

      res.status(200).json({ ok: true, payment_status: 'failed' });
      return;
    }

    res.status(200).json({ ok: true, payment_status: 'pending' });
  } catch (e: any) {
    // Callback should never break QPay; respond 200 with error info.
    res.status(200).json({ ok: false, error: e?.message ?? 'Unknown error' });
  }
}

