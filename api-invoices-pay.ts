// src/app/api/invoices/[id]/pay/route.ts
// GET /api/invoices/[id]/pay — Returns invoice payment details for inline display

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getPaymentStatus, getPaymentQR } from '@/lib/coinpayportal';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    // Fetch invoice from local database
    const { data: invoice, error } = await supabase
      .from('gig_invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Verify the user is either the payer or the payee
    if (invoice.payer_id !== user.id && invoice.payee_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // If the invoice has a coinpay payment ID, check CoinPay for live status
    let paymentStatus = null;
    let qrCodeUrl = null;

    if (invoice.coinpay_payment_id) {
      try {
        paymentStatus = await getPaymentStatus(invoice.coinpay_payment_id);
        qrCodeUrl = await getPaymentQR(invoice.coinpay_payment_id);
      } catch (err) {
        console.error('CoinPay status check failed:', err);
        // Continue with local data if CoinPay is unreachable
      }
    }

    // Build payment response
    const expiresAt = invoice.payment_expires_at || 
      new Date(Date.now() + 20 * 60 * 1000).toISOString(); // 20 min default

    return NextResponse.json({
      id: invoice.id,
      amount: invoice.amount,
      amount_crypto: invoice.amount_crypto,
      currency: invoice.currency || 'SOL',
      payment_address: invoice.payment_address,
      qr_code_url: qrCodeUrl,
      status: paymentStatus?.status || invoice.status || 'pending',
      expires_at: expiresAt,
      description: invoice.description || invoice.notes,
      payer_name: invoice.payer_name,
      payee_name: invoice.payee_name,
      order_id: invoice.order_id,
    });
  } catch (error) {
    console.error('Get invoice payment error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
