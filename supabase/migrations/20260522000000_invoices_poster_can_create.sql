-- Allow gig posters to create invoices for accepted applicants, in addition
-- to the existing worker-initiated flow. The poster pays via CoinPayPortal's
-- pay_url either way; this just lets a poster nudge the payment instead of
-- waiting for the worker to submit an invoice.

CREATE POLICY "Posters can create invoices for their gigs"
  ON gig_invoices FOR INSERT
  WITH CHECK (auth.uid() = poster_id);

CREATE POLICY "Posters can update invoices on their gigs"
  ON gig_invoices FOR UPDATE
  USING (auth.uid() = poster_id);
