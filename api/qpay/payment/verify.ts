import { qpayCheckInvoice } from '../_lib/qpayClient';
import { getSupabaseServer } from '../_lib/supabaseServer';

function isoNow() {
  return new Date().toISOString();
}

function normalizePaymentStatus(status: string | undefined) {
  const s = (status ?? '').toUpperCase();
  if (s === 'PAID') return 'success';
  if (s === 'FAILED' || s === 'REFUNDED') return 'failed';
  return 'pending';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body ?? {};
    const caseId = body.caseId as string | undefined;
    if (!caseId) return res.status(400).json({ error: 'Missing caseId' });

    const supabase: any = getSupabaseServer();

    // Get the latest pending qpay payment record for this case.
    const { data: paymentRow, error: paymentSelectError } = await supabase
      .from('payments')
      .select('id, case_id, provider, transaction_id, payment_status')
      .eq('case_id', caseId)
      .eq('provider', 'qpay')
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (paymentSelectError) throw paymentSelectError;
    if (!paymentRow) return res.status(404).json({ error: 'No pending qpay payment found for case' });

    const check = await qpayCheckInvoice({ objectId: paymentRow.transaction_id });
    const firstRow = check?.rows?.[0];
    const normalized = normalizePaymentStatus(firstRow?.payment_status);

    const nowIso = isoNow();

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
        .eq('id', caseId);

      if (caseUpdateError) throw caseUpdateError;

      await supabase.from('audit_logs').insert({
        actor_name: 'QPay callback',
        actor_role: 'worker',
        case_id: caseId,
        action: 'PAYMENT_QPAY_VERIFIED',
        before_status: 'PENDING_PAYMENT',
        after_status: 'PAID',
        metadata: { payment_id: firstRow?.payment_id ?? null },
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

      // Move case back to IMPOUNDED so user can retry.
      const { error: caseUpdateError } = await supabase
        .from('parking_cases')
        .update({
          status: 'IMPOUNDED',
          status_updated_at: nowIso,
          paid_at: null,
        })
        .eq('id', caseId);

      if (caseUpdateError) throw caseUpdateError;

      await supabase.from('audit_logs').insert({
        actor_name: 'QPay callback',
        actor_role: 'worker',
        case_id: caseId,
        action: 'PAYMENT_QPAY_FAILED',
        before_status: 'PENDING_PAYMENT',
        after_status: 'IMPOUNDED',
        metadata: { payment_id: firstRow?.payment_id ?? null },
      });

      res.status(200).json({ ok: true, payment_status: 'failed' });
      return;
    }

    res.status(200).json({ ok: true, payment_status: 'pending' });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Unknown error' });
  }
}

