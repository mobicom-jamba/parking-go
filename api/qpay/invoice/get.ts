import { qpayGetInvoice } from '../_lib/qpayClient.js';
import { getSupabaseServer } from '../_lib/supabaseServer.js';

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
    const { data: payment, error: paymentErr } = await supabase
      .from('payments')
      .select('transaction_id, payment_status')
      .eq('case_id', caseId)
      .eq('provider', 'qpay')
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentErr) throw paymentErr;
    if (!payment?.transaction_id) {
      return res.status(404).json({ error: 'Pending QPay invoice not found' });
    }

    const invoice = await qpayGetInvoice({ invoiceId: payment.transaction_id });
    res.status(200).json({ ok: true, invoice, transactionId: payment.transaction_id });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Unknown error' });
  }
}

