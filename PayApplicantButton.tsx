// src/app/dashboard/invoices/PayApplicantButton.tsx
// Full payment flow: form modal -> inline payment modal with QR code
// No redirect to coinpayportal.com

'use client';

import React, { useState } from 'react';
import InlinePayModal from '@/components/invoices/InlinePayModal';

interface PayApplicantButtonProps {
  gigId: string;
  applicationId: string;
  workerName: string;
  workerId: string;
  gigTitle: string;
  budget: number;
}

export default function PayApplicantButton({
  gigId,
  applicationId,
  workerName,
  gigTitle,
  budget,
}: PayApplicantButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceData, setInvoiceData] = useState<any>(null);

  // Form state
  const [amount, setAmount] = useState(budget);
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/gigs/' + gigId + '/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: applicationId,
          amount: amount,
          currency: 'USD',
          notes: notes || 'Payment for: ' + gigTitle,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to create invoice');
      }

      const data = await response.json();
      setInvoiceData(data);
      setShowForm(false);
      setShowPayModal(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setShowForm(false);
    setShowPayModal(false);
    setInvoiceData(null);
    setError(null);
  };

  return (
    <>
      <button
        onClick={() => setShowForm(true)}
        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
      >
        Pay " + workerName + "
      </button>

      {/* Invoice creation form modal */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Create Invoice</h2>
                <button onClick={() => setShowForm(false)} className="text-white/80 hover:text-white">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-white/80 mt-1">Send invoice to " + workerName + "</p>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (USD)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  min={0.01}
                  step={0.01}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="What is this payment for?"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  {isLoading ? 'Creating...' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline payment modal */}
      {invoiceData && showPayModal && (
        <InlinePayModal
          isOpen={showPayModal}
          onClose={handleClose}
          invoiceId={invoiceData.id}
          amount={invoiceData.amount || amount}
          amountCrypto={invoiceData.amount_crypto || '0'}
          currency={invoiceData.currency || 'SOL'}
          paymentAddress={invoiceData.payment_address || ''}
          qrCodeUrl={invoiceData.qr_code_url || null}
          expiresAt={invoiceData.payment_expires_at || new Date(Date.now() + 20 * 60 * 1000).toISOString()}
          description={gigTitle}
          payeeName={workerName}
        />
      )}
    </>
  );
}
