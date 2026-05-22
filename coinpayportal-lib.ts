// Updated src/lib/coinpayportal.ts — Adds payment status polling and QR code retrieval

import { createHmac } from 'crypto';

const COINPAY_API = process.env.COINPAY_API_URL || 'https://coinpayportal.com/api';
const COINPAY_SECRET = process.env.COINPAY_WEBHOOK_SECRET;

interface CoinPayPaymentResponse {
  id: string;
  address: string;
  amount_crypto: string;
  amount_usd: string;
  currency: string;
  checkout_url: string;
  status: string;
  expires_at: string;
  qr_code_url?: string;
}

interface PaymentStatusResponse {
  status: 'pending' | 'confirmed' | 'expired' | 'cancelled' | 'overpaid' | 'underpaid';
  txid?: string;
  confirmations?: number;
  amount_received?: string;
  amount_crypto?: string;
}

/**
 * Create a direct CoinPay payment request.
 * Returns payment details inline (no redirect).
 */
export async function createPayment(params: {
  amount: number;
  currency?: string;
  order_id: string;
  description?: string;
  metadata?: Record<string, string>;
}): Promise<CoinPayPaymentResponse> {
  const response = await fetch(`${COINPAY_API}/payments/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.COINPAY_API_KEY || '',
    },
    body: JSON.stringify({
      amount: params.amount,
      currency: params.currency || 'USD',
      order_id: params.order_id,
      description: params.description,
      metadata: params.metadata,
    }),
  });

  if (!response.ok) {
    throw new Error(`CoinPay create payment failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Poll CoinPay for payment status.
 */
export async function getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
  const response = await fetch(`${COINPAY_API}/payments/${paymentId}/status`, {
    headers: {
      'x-api-key': process.env.COINPAY_API_KEY || '',
    },
  });

  if (!response.ok) {
    throw new Error(`CoinPay status check failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get QR code URL for a payment.
 */
export async function getPaymentQR(paymentId: string): Promise<string> {
  // CoinPay returns QR code as a URL
  return `${COINPAY_API}/payments/${paymentId}/qr?api_key=${process.env.COINPAY_API_KEY}`;
}

/**
 * Verify CoinPay webhook signature.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
): boolean {
  if (!COINPAY_SECRET) return false;
  const expected = createHmac('sha256', COINPAY_SECRET)
    .update(payload)
    .digest('hex');
  return expected === signature;
}
