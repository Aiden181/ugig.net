// src/app/api/payments/coinpayportal/webhook/route.ts (enhancement)
// Extended webhook handler that also updates gig_invoices on payment confirmation

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { verifyWebhookSignature } from '@/lib/coinpayportal';

interface CoinPayWebhookPayload {
  event: string;
  payment_id: string;
  order_id: string;
  status: string;
  txid?: string;
  amount_received?: string;
  amount_crypto?: string;
  confirmations?: number;
  metadata?: Record<string, string>;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-coinpay-signature') || '';
    
    // Verify webhook signature
    if (!verifyWebhookSignature(body, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload: CoinPayWebhookPayload = JSON.parse(body);
    console.log('CoinPay webhook received:', payload.event, 'for payment:', payload.payment_id);

    const supabase = createRouteHandlerClient({ cookies });

    // Handle payment confirmed event
    if (payload.event === 'payment.confirmed' && payload.status === 'confirmed') {
      // 1. Update the payments table (existing behavior)
      const { error: paymentError } = await supabase
        .from('payments')
        .update({
          status: 'confirmed',
          txid: payload.txid,
          amount_received: payload.amount_received,
          confirmed_at: new Date().toISOString(),
        })
        .eq('coinpay_payment_id', payload.payment_id);

      if (paymentError) {
        console.error('Failed to update payments table:', paymentError);
      }

      // 2. Update gig_invoices table (new behavior - inline payment support)
      const { error: invoiceError } = await supabase
        .from('gig_invoices')
        .update({
          status: 'paid',
          txid: payload.txid,
          paid_at: new Date().toISOString(),
          amount_received: payload.amount_received,
        })
        .eq('coinpay_payment_id', payload.payment_id);

      if (invoiceError) {
        console.error('Failed to update gig_invoices table:', invoiceError);
      } else {
        console.log('Invoice updated to paid for payment:', payload.payment_id);
      }

      // 3. If metadata contains an invoice_id, also update by that id
      if (payload.metadata?.invoice_id) {
        const { error: metaError } = await supabase
          .from('gig_invoices')
          .update({
            status: 'paid',
            txid: payload.txid,
            paid_at: new Date().toISOString(),
          })
          .eq('id', payload.metadata.invoice_id);

        if (metaError) {
          console.error('Failed to update invoice by metadata id:', metaError);
        }
      }
    }

    // Handle payment expired event
    if (payload.event === 'payment.expired') {
      const { error: invoiceError } = await supabase
        .from('gig_invoices')
        .update({
          status: 'expired',
        })
        .eq('coinpay_payment_id', payload.payment_id);

      if (invoiceError) {
        console.error('Failed to expire invoice:', invoiceError);
      }
    }

    // Always respond 200 to acknowledge receipt
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Always return 200 to prevent CoinPay from retrying on parse errors
    return NextResponse.json({ received: true });
  }
}
