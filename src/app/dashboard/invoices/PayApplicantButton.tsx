"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, DollarSign } from "lucide-react";

interface PayApplicantButtonProps {
  gigId: string;
  applicationId: string;
  suggestedAmount: number | null;
  workerName: string;
}

export function PayApplicantButton({
  gigId,
  applicationId,
  suggestedAmount,
  workerName,
}: PayApplicantButtonProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggestedAmount?.toString() || "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);

  const submit = async () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/gigs/${gigId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          amount: parsed,
          currency: "USD",
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to create invoice");
        return;
      }
      setPayUrl(json.data?.pay_url || null);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (payUrl) {
    return (
      <a
        href={payUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ExternalLink className="h-4 w-4" />
        Open payment link
      </a>
    );
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} className="gap-2">
        <DollarSign className="h-4 w-4" />
        Pay {workerName}
      </Button>
    );
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-background">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Amount (USD)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          min="0.01"
          step="0.01"
          className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What you're paying for"
          className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={submitting || !amount} onClick={submit} className="flex-1">
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Create payment link
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
