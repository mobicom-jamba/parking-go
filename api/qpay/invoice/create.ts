import { qpayCreateInvoice } from '../_lib/qpayClient.js';
import { getSupabaseServer } from '../_lib/supabaseServer.js';
import { requireEnv } from '../_lib/env.js';

function isoNow() {
  return new Date().toISOString();
}

function buildSenderInvoiceNo(caseId: string) {
  // QPay constraint: max length 45.
  // Keep uniqueness via timestamp while preserving case traceability.
  const compactCaseId = caseId.replace(/-/g, '').slice(0, 20);
  const ts = Date.now().toString(36);
  return `p${compactCaseId}${ts}`.slice(0, 45);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body ?? {};
    const caseId = body.caseId as string | undefined;
    const amount = Number(body.amount);
    const impoundFee = Number(body.impoundFee);
    const nights = Number(body.nights);
    const plate = (body.plate as string | undefined) ?? '';
    const invoiceDescription = (body.invoiceDescription as string | undefined) ?? `Parking fee for ${plate}`.trim();

    if (!caseId) return res.status(400).json({ error: 'Missing caseId' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (!Number.isFinite(impoundFee) || impoundFee < 0) return res.status(400).json({ error: 'Invalid impoundFee' });
    if (!Number.isFinite(nights) || nights <= 0) return res.status(400).json({ error: 'Invalid nights' });

    const invoiceCode = requireEnv('QPAY_INVOICE_CODE');
    const invoiceReceiverCode = requireEnv('QPAY_INVOICE_RECEIVER_CODE');
    const senderBranchCode = requireEnv('QPAY_SENDER_BRANCH_CODE');
    const callbackBase = requireEnv('QPAY_CALLBACK_URL');
    const callbackParsed = new URL(callbackBase);
    // Keep case context in callback so we can safely resolve pending payment
    // even when payment_id is not populated on callback URL.
    callbackParsed.searchParams.set('case_id', caseId);
    const callbackUrl = callbackParsed.toString();

    // QPay invoice create: sender_invoice_no must be unique and <= 45 chars.
    const senderInvoiceNo = buildSenderInvoiceNo(caseId);

    const invoice = await qpayCreateInvoice({
      invoiceCode,
      senderInvoiceNo,
      invoiceReceiverCode,
      senderBranchCode,
      invoiceDescription,
      amount,
      callbackUrl,
      enableExpiry: false,
      allowPartial: false,
    });

    // Store invoice_id as our transaction_id (object_id for payment/check).
    const transactionId = invoice.invoice_id;
    const supabase: any = getSupabaseServer();

    const { error: paymentError } = await supabase.from('payments').insert({
      case_id: caseId,
      provider: 'qpay',
      transaction_id: transactionId,
      amount,
      currency: 'MNT',
      payment_status: 'pending',
      paid_at: null,
      failed_at: null,
    });
    if (paymentError) throw paymentError;

    const { error: caseError } = await supabase.from('parking_cases').update({
      status: 'PENDING_PAYMENT',
      status_updated_at: isoNow(),
      nights,
      impound_fee: impoundFee,
      // transfer_fee / total_amount are already computed by client in your current flow.
    }).eq('id', caseId);
    if (caseError) throw caseError;

    await supabase.from('audit_logs').insert({
      actor_name: 'Хэрэглэгч',
      actor_role: 'user',
      case_id: caseId,
      action: 'PAYMENT_QPAY_INVOICE_CREATED',
      before_status: 'IMPOUNDED',
      after_status: 'PENDING_PAYMENT',
      metadata: {
        qpay_invoice_id: transactionId,
        amount,
        currency: 'MNT',
      },
    });

    res.status(200).json({ ok: true, invoice, transactionId });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Unknown error' });
  }
}

