// src/app/dashboard/invoices/page.tsx (updated)
// Invoice dashboard page with inline payment support

'use client';

import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import InlinePayModal from '@/components/invoices/InlinePayModal';
import PayApplicantButton from './PayApplicantButton';

interface Invoice {
  id: string;
  gig_id: string;
  gig_title?: string;
  amount: number;
  amount_crypto?: string;
  currency?: string;
  payment_address?: string;
  status: string;
  created_at: string;
  payer_id: string;
  payee_id: string;
  payer_name?: string;
  payee_name?: string;
  description?: string;
  coinpay_payment_id?: string;
  payment_expires_at?: string;
  paid_at?: string;
  txid?: string;
}

export default function InvoicesPage() {
  const supabase = createClientComponentClient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [payModalInvoice, setPayModalInvoice] = useState<Invoice | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch invoices where user is payer or payee
      const { data, error } = await supabase
        .from('gig_invoices')
        .select('*')
        .or('payer_id.eq.' + user.id + ',payee_id.eq.' + user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setInvoices(data);
      }
      setLoading(false);
    };
    load();
  }, [supabase]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'awaiting_payment':
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'expired':
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handlePayClick = (invoice: Invoice) => {
    setPayModalInvoice(invoice);
  };

  const handlePayModalClose = () => {
    setPayModalInvoice(null);
    // Refresh invoices to get updated status
    refreshInvoices();
  };

  const refreshInvoices = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('gig_invoices')
      .select('*')
      .or('payer_id.eq.' + user.id + ',payee_id.eq.' + user.id)
      .order('created_at', { ascending: false });

    if (data) setInvoices(data);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-indigo-600" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Invoices</h1>

      {invoices.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <p className="text-gray-500">No invoices yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Invoices will appear here when you create or receive them
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">
                      {invoice.description || invoice.gig_title || 'Invoice'}
                    </h3>
                    <span className={'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ' + statusColor(invoice.status)}>
                      {invoice.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                    <span>${invoice.amount.toFixed(2)} USD</span>
                    {invoice.amount_crypto && (
                      <span>{invoice.amount_crypto} {invoice.currency || 'SOL'}</span>
                    )}
                    {invoice.payee_name && (
                      <span>To: {invoice.payee_name}</span>
                    )}
                    {invoice.payer_name && (
                      <span>From: {invoice.payer_name}</span>
                    )}
                    <span>{new Date(invoice.created_at).toLocaleDateString()}</span>
                  </div>
                  {invoice.txid && (
                    <p className="mt-1 text-xs text-gray-400 font-mono">
                      TX: {invoice.txid.substring(0, 16)}...
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 ml-4">
                  {/* Show Pay button only for unpaid invoices where user is payer */}
                  {invoice.status === 'awaiting_payment' && user && invoice.payer_id === user.id && (
                    <button
                      onClick={() => handlePayClick(invoice)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                    >
                      Pay Now
                    </button>
                  )}
                  {invoice.status === 'paid' && (
                    <span className="text-green-600 text-sm font-medium">Paid</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inline payment modal */}
      {payModalInvoice && (
        <InlinePayModal
          isOpen={!!payModalInvoice}
          onClose={handlePayModalClose}
          invoiceId={payModalInvoice.id}
          amount={payModalInvoice.amount}
          amountCrypto={payModalInvoice.amount_crypto || '0'}
          currency={payModalInvoice.currency || 'SOL'}
          paymentAddress={payModalInvoice.payment_address || ''}
          qrCodeUrl={null}
          expiresAt={payModalInvoice.payment_expires_at || new Date(Date.now() + 20 * 60 * 1000).toISOString()}
          description={payModalInvoice.description}
          payerName={payModalInvoice.payer_name}
          payeeName={payModalInvoice.payee_name}
        />
      )}
    </div>
  );
}
