// src/app/api/invoices/[id]/status/route.ts
// GET /api/invoices/[id]/status — Polled by frontend every 5s for payment confirmation

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getPaymentStatus } from '@/lib/coinpayportal';

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

    // Verify the user is involved in this invoice
    if (invoice.payer_id !== user.id && invoice.payee_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let coinpayStatus = null;

    // If there's a CoinPay payment ID, poll CoinPay for live status
    if (invoice.coinpay_payment_id) {
      try {
        coinpayStatus = await getPaymentStatus(invoice.coinpay_payment_id);
      } catch (err) {
        console.error('CoinPay status poll failed:', err);
      }
    }

    // Determine the authoritative status
    let status = invoice.status;
    let txid = null;
    let confirmations = 0;

    if (coinpayStatus) {
      // Map CoinPay status to our local status
      if (coinpayStatus.status === 'confirmed' && status !== 'paid') {
        // Payment confirmed on CoinPay — update local database
        const { error: updateError } = await supabase
          .from('gig_invoices')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            txid: coinpayStatus.txid,
          })
          .eq('id', id);

        if (!updateError) {
          status = 'paid';
          txid = coinpayStatus.txid;
          confirmations = coinpayStatus.confirmations || 0;
        }
      } else if (coinpayStatus.status === 'expired') {
        status = 'expired';
      } else if (coinpayStatus.status === 'cancelled') {
        status = 'cancelled';
      } else if (coinpayStatus.status === 'pending') {
        status = 'awaiting_payment';
      }
    }

    // Check if payment has expired (local timer)
    const expiresAt = invoice.payment_expires_at 
      ? new Date(invoice.payment_expires_at).getTime() 
      : Date.now() + 20 * 60 * 1000;
    
    const isExpired = Date.now() > expiresAt && status !== 'paid';

    return NextResponse.json({
      id: invoice.id,
      status: isExpired ? 'expired' : status,
      txid,
      confirmations,
      amount_received: coinpayStatus?.amount_received || null,
      amount_crypto: invoice.amount_crypto,
      expires_at: expiresAt,
      paid_at: invoice.paid_at,
    });
  } catch (error) {
    console.error('Invoice status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
