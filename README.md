# ugig.net Inline Payment System

This implements a full inline payment modal system that keeps users on ugig.net instead of redirecting to coinpayportal.com.

## Files

- **`InlinePayModal.tsx`** — Modal with QR code display, copy-to-clipboard wallet address, 20-min countdown timer, real-time status polling every 5s
- **`api-invoices-pay.ts`** — GET /api/invoices/[id]/pay — API route returning payment details
- **`api-invoices-status.ts`** — GET /api/invoices/[id]/status — Polled by frontend for payment confirmation
- **`coinpayportal-lib.ts`** — Updated lib/coinpayportal.ts with getPaymentStatus() and getPaymentQR() helpers
- **`PayApplicantButton.tsx`** — Updated button that shows inline payment instead of redirect
- **`webhook-enhancement.ts`** — Webhook handler update to update gig_invoices on payment confirmation
- **`dashboard-invoices-page.tsx`** — Updated invoice dashboard page wiring up inline payment

## Flow

1. Poster clicks "Pay [WorkerName]"
2. Modal opens with amount/notes form
3. Poster submits → POST /api/gigs/[id]/invoice
4. Backend creates CoinPay payment + local invoice record
5. Backend returns: { payment_address, amount_crypto, currency, expires_at }
6. Frontend shows inline payment UI with QR code, wallet address, copy button, countdown timer
7. User sends crypto from their wallet
8. Frontend polls GET /api/invoices/[id]/status every 5s
9. CoinPay webhook → /api/payments/coinpayportal/webhook
10. Webhook updates invoice status to "paid"
11. Frontend polling detects status change → shows "✅ Paid!"
