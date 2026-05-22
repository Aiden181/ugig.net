// src/components/invoices/InlinePayModal.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface InlinePayModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  amount: number;
  amountCrypto: string;
  currency: string;
  paymentAddress: string;
  qrCodeUrl: string | null;
  expiresAt: string;
  description?: string;
  payerName?: string;
  payeeName?: string;
}

type PaymentStatus = 'loading' | 'awaiting_payment' | 'detecting' | 'paid' | 'expired' | 'error';

export default function InlinePayModal(props: InlinePayModalProps) {
  const {
    isOpen, onClose, invoiceId, amount, amountCrypto, currency,
    paymentAddress, qrCodeUrl, expiresAt, description, payerName, payeeName,
  } = props;

  const [copied, setCopied] = React.useState(false);
  const [status, setStatus] = React.useState<PaymentStatus>('awaiting_payment');
  const [timeLeft, setTimeLeft] = React.useState('20:00');
  const [error, setError] = React.useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const updateTimer = React.useCallback(() => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) {
      setTimeLeft('00:00');
      setStatus('expired');
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
  }, [expiresAt]);

  React.useEffect(() => {
    if (!isOpen) return;
    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isOpen, updateTimer]);

  const pollStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/invoices/' + invoiceId + '/status');
      if (!res.ok) throw new Error('Status check failed');
      const data = await res.json();
      if (data.status === 'paid') {
        setStatus('paid');
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (data.status === 'expired' || data.status === 'cancelled') {
        setStatus('expired');
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (data.amount_received) {
        setStatus('detecting');
      }
    } catch {
      setError('Connection issue - retrying...');
    }
  }, [invoiceId]);

  React.useEffect(() => {
    if (!isOpen) return;
    pollStatus();
    pollRef.current = setInterval(pollStatus, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isOpen, pollStatus]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(paymentAddress);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = paymentAddress;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWallet = () => {
    window.open('solana:' + paymentAddress + '?amount=' + amountCrypto + '&spl-token=' + currency, '_blank', 'noopener,noreferrer');
  };

  if (!isOpen) return null;

  const statusBadge = () => {
    if (status === 'awaiting_payment') {
      return React.createElement('div', { className: 'flex items-center gap-2 text-yellow-600 bg-yellow-50 px-4 py-3 rounded-lg' },
        React.createElement('span', { className: 'animate-pulse text-xl' }, String.fromCodePoint(0x23F3)),
        React.createElement('div', null,
          React.createElement('p', { className: 'font-semibold' }, 'Waiting for payment'),
          React.createElement('p', { className: 'text-sm text-yellow-700' }, 'Send exactly ' + amountCrypto + ' ' + currency + ' to the address above')
        )
      );
    }
    if (status === 'detecting') {
      return React.createElement('div', { className: 'flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-3 rounded-lg' },
        React.createElement('span', { className: 'animate-spin text-xl' }, String.fromCodePoint(0x1F504)),
        React.createElement('div', null,
          React.createElement('p', { className: 'font-semibold' }, 'Detecting payment...'),
          React.createElement('p', { className: 'text-sm text-blue-700' }, 'We see a transaction - confirming on-chain')
        )
      );
    }
    if (status === 'paid') {
      return React.createElement('div', { className: 'flex items-center gap-2 text-green-600 bg-green-50 px-4 py-3 rounded-lg' },
        React.createElement('span', { className: 'text-xl' }, String.fromCodePoint(0x2705)),
        React.createElement('div', null,
          React.createElement('p', { className: 'font-semibold' }, 'Payment confirmed!'),
          React.createElement('p', { className: 'text-sm text-green-700' }, 'Thank you! The invoice has been marked as paid.')
        )
      );
    }
    if (status === 'expired') {
      return React.createElement('div', { className: 'flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg' },
        React.createElement('span', { className: 'text-xl' }, String.fromCodePoint(0x274C)),
        React.createElement('div', null,
          React.createElement('p', { className: 'font-semibold' }, 'Payment expired'),
          React.createElement('p', { className: 'text-sm text-red-700' }, 'This invoice has expired. Please request a new invoice.')
        )
      );
    }
    return React.createElement('div', { className: 'flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg' },
      React.createElement('span', { className: 'text-xl' }, String.fromCodePoint(0x26A0, 0xFE0F)),
      React.createElement('div', null,
        React.createElement('p', { className: 'font-semibold' }, 'Error'),
        React.createElement('p', { className: 'text-sm text-red-700' }, error || 'Something went wrong')
      )
    );
  };

  return React.createElement('div', { className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm' },
    React.createElement('div', { className: 'relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden' },
      React.createElement('div', { className: 'bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white' },
        React.createElement('div', { className: 'flex items-center justify-between' },
          React.createElement('h2', { className: 'text-lg font-bold' }, 'Pay Invoice'),
          React.createElement('button', { onClick: onClose, className: 'text-white/80 hover:text-white transition-colors', 'aria-label': 'Close' },
            React.createElement('svg', { className: 'w-6 h-6', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' },
              React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M6 18L18 6M6 6l12 12' })
            )
          )
        ),
        description ? React.createElement('p', { className: 'text-sm text-white/80 mt-1' }, description) : null
      ),
      React.createElement('div', { className: 'px-6 py-5 space-y-5' },
        React.createElement('div', { className: 'text-center' },
          React.createElement('p', { className: 'text-sm text-gray-500 mb-1' }, 'Amount Due'),
          React.createElement('p', { className: 'text-3xl font-bold text-gray-900' },
            '$' + amount.toFixed(2),
            React.createElement('span', { className: 'text-lg font-normal text-gray-500' }, ' USD')
          ),
          React.createElement('p', { className: 'text-sm text-gray-500 mt-1' }, String.fromCodePoint(0x2248) + ' ' + amountCrypto + ' ' + currency)
        ),
        React.createElement('div', { className: 'flex justify-center' },
          React.createElement('div', { className: 'bg-white border-2 border-gray-200 rounded-xl p-3 shadow-sm' },
            qrCodeUrl
              ? React.createElement('img', { src: qrCodeUrl, alt: 'Payment QR', className: 'w-48 h-48' })
              : React.createElement('div', { className: 'w-48 h-48 bg-gray-100 flex items-center justify-center' },
                  React.createElement('div', { className: 'bg-gradient-to-br from-gray-200 to-gray-300 rounded-lg w-40 h-40 flex items-center justify-center' },
                    React.createElement('span', { className: 'text-gray-400 text-sm text-center px-2' }, 'QR not available - use address below')
                  )
                )
          )
        ),
        React.createElement('div', null,
          React.createElement('p', { className: 'text-sm text-gray-500 mb-2' }, 'Send exactly ', React.createElement('strong', null, amountCrypto + ' ' + currency), ' to:'),
          React.createElement('div', { className: 'flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3' },
            React.createElement('code', { className: 'flex-1 text-xs font-mono text-gray-800 break-all select-all' }, paymentAddress),
            React.createElement('button', { onClick: handleCopy, className: 'flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors' },
              copied ? 'Copied!' : 'Copy'
            )
          )
        ),
        React.createElement('button', { onClick: handleOpenWallet, className: 'w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2.5 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2' },
          'Open in Wallet'
        ),
        statusBadge(),
        status === 'awaiting_payment'
          ? React.createElement('div', { className: 'text-center' },
              React.createElement('p', { className: 'text-xs text-gray-400 mb-1' }, 'Expires in'),
              React.createElement('p', { className: 'text-2xl font-mono font-bold text-gray-700' }, timeLeft)
            )
          : null
      ),
      React.createElement('div', { className: 'border-t border-gray-100 px-6 py-3 flex justify-between items-center' },
        React.createElement('p', { className: 'text-xs text-gray-400' }, 'Secured by CoinPayPortal'),
        status === 'paid'
          ? React.createElement('button', { onClick: onClose, className: 'bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors' }, 'Done')
          : null
      )
    )
  );
}
