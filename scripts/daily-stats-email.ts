#!/usr/bin/env npx tsx
/**
 * Daily Stats Email for ugig.net
 *
 * Run via cron: 0 8 * * * cd /home/ubuntu/src/ugig.net && npx tsx scripts/daily-stats-email.ts
 *
 * Usage:
 *   npx tsx scripts/daily-stats-email.ts                    # send to default
 *   npx tsx scripts/daily-stats-email.ts --to me@example.com
 *   npx tsx scripts/daily-stats-email.ts --dry-run          # print to stdout, don't send
 */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env.prod"), override: true });
dotenv.config({ override: true });

const DEFAULT_TO = "anthony@profullstack.com";
const FROM_EMAIL = process.env.STATS_FROM_EMAIL || "ugig Stats <stats@ugig.net>";
const DRY_RUN = process.argv.includes("--dry-run");
const toArg = process.argv.findIndex((a) => a === "--to");
const TO_EMAIL = toArg >= 0 && process.argv[toArg + 1] ? process.argv[toArg + 1] : DEFAULT_TO;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Helpers ───────────────────────────────────────────────────────────────

async function count(table: string, filter?: Record<string, unknown>) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) {
    for (const [col, val] of Object.entries(filter)) {
      if (val === null) q = q.is(col, null);
      else q = q.eq(col, val as string);
    }
  }
  const { count: c, error } = await q;
  if (error) {
    console.warn(`  count(${table}) failed: ${error.message}`);
    return 0;
  }
  return c ?? 0;
}

async function countSince(table: string, col: string, hours: number) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { count: c, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(col, since);
  if (error) {
    console.warn(`  countSince(${table}) failed: ${error.message}`);
    return 0;
  }
  return c ?? 0;
}

async function countSinceDays(table: string, col: string, days: number) {
  return countSince(table, col, days * 24);
}

async function recentProfiles(limit: number) {
  const { data } = await supabase
    .from("profiles")
    .select("username, full_name, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function recentGigs(limit: number) {
  const { data } = await supabase
    .from("gigs")
    .select("title, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── Build report ──────────────────────────────────────────────────────────

async function buildReport(): Promise<{ subject: string; html: string; text: string }> {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];

  // Users
  const totalUsers = await count("profiles");
  const newUsers24h = await countSince("profiles", "created_at", 24);
  const newUsers7d = await countSinceDays("profiles", "created_at", 7);
  const newUsers30d = await countSinceDays("profiles", "created_at", 30);
  const recentUsers = await recentProfiles(5);

  // Gigs (gig_status: draft | active | paused | closed | filled)
  const totalGigs = await count("gigs");
  const activeGigs = await count("gigs", { status: "active" });
  const filledGigs = await count("gigs", { status: "filled" });
  const draftGigs = await count("gigs", { status: "draft" });
  const newGigs24h = await countSince("gigs", "created_at", 24);
  const newGigs7d = await countSinceDays("gigs", "created_at", 7);
  const newGigs30d = await countSinceDays("gigs", "created_at", 30);
  const recentGigList = await recentGigs(5);

  // Applications
  const totalApps = await count("applications");
  const pendingApps = await count("applications", { status: "pending" });
  const acceptedApps = await count("applications", { status: "accepted" });
  const rejectedApps = await count("applications", { status: "rejected" });
  const newApps24h = await countSince("applications", "created_at", 24);
  const newApps7d = await countSinceDays("applications", "created_at", 7);

  // Posts / feed
  const totalPosts = await count("posts");
  const newPosts24h = await countSince("posts", "created_at", 24);
  const newPosts7d = await countSinceDays("posts", "created_at", 7);
  const totalPostComments = await count("post_comments");
  const newPostComments24h = await countSince("post_comments", "created_at", 24);

  // Social
  const totalFollows = await count("follows");
  const newFollows24h = await countSince("follows", "created_at", 24);
  const totalEndorsements = await count("endorsements");
  const totalReviews = await count("reviews");
  const newReviews24h = await countSince("reviews", "created_at", 24);

  // Messaging
  const totalConversations = await count("conversations");
  const newConvos24h = await countSince("conversations", "created_at", 24);
  const totalMessages = await count("messages");
  const newMessages24h = await countSince("messages", "created_at", 24);

  // Payments (payment_status: pending | confirmed | forwarded | expired | failed)
  const totalPayments = await count("payments");
  const confirmedPayments = await count("payments", { status: "confirmed" });
  const forwardedPayments = await count("payments", { status: "forwarded" });
  const pendingPayments = await count("payments", { status: "pending" });
  const newPayments24h = await countSince("payments", "created_at", 24);

  // ── Text version ──
  const text = `
ugig.net Daily Report — ${dateStr}
${"=".repeat(50)}

USERS
  Total: ${totalUsers}
  New (24h): ${newUsers24h}
  New (7d): ${newUsers7d}
  New (30d): ${newUsers30d}

RECENT SIGNUPS
${recentUsers.map((u) => `  • ${u.full_name || u.username || "(no name)"} @${u.username} (${u.created_at?.slice(0, 10)})`).join("\n") || "  (none)"}

GIGS
  Total: ${totalGigs}
  Active: ${activeGigs}
  Draft: ${draftGigs}
  Filled: ${filledGigs}
  New (24h): ${newGigs24h}
  New (7d): ${newGigs7d}
  New (30d): ${newGigs30d}

RECENT GIGS
${recentGigList.map((g) => `  • ${g.title || "(untitled)"} [${g.status}] (${g.created_at?.slice(0, 10)})`).join("\n") || "  (none)"}

APPLICATIONS
  Total: ${totalApps}
  Pending: ${pendingApps}
  Accepted: ${acceptedApps}
  Rejected: ${rejectedApps}
  New (24h): ${newApps24h}
  New (7d): ${newApps7d}

POSTS & FEED
  Total posts: ${totalPosts}
  New posts (24h): ${newPosts24h}
  New posts (7d): ${newPosts7d}
  Total post comments: ${totalPostComments}
  New comments (24h): ${newPostComments24h}

SOCIAL
  Follows: ${totalFollows} (+${newFollows24h} 24h)
  Endorsements: ${totalEndorsements}
  Reviews: ${totalReviews} (+${newReviews24h} 24h)

MESSAGING
  Conversations: ${totalConversations} (+${newConvos24h} 24h)
  Messages: ${totalMessages} (+${newMessages24h} 24h)

PAYMENTS
  Total: ${totalPayments}
  Confirmed: ${confirmedPayments}
  Forwarded: ${forwardedPayments}
  Pending: ${pendingPayments}
  New (24h): ${newPayments24h}
`.trim();

  // ── HTML version ──
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e; background: #f8f9fa;">
  <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 20px 24px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 20px;">📊 ugig.net Daily Report</h1>
    <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">${dateStr}</p>
  </div>

  <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e0e0e0; border-top: none;">

    <h2 style="font-size: 16px; color: #6366f1; margin: 0 0 12px;">👤 Users</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Total</td><td style="text-align: right; font-weight: bold;">${totalUsers}</td></tr>
      <tr><td style="padding: 4px 0;">New (24h)</td><td style="text-align: right; font-weight: bold; color: ${newUsers24h > 0 ? "#16a34a" : "#666"};">${newUsers24h}</td></tr>
      <tr><td style="padding: 4px 0;">New (7d)</td><td style="text-align: right;">${newUsers7d}</td></tr>
      <tr><td style="padding: 4px 0;">New (30d)</td><td style="text-align: right;">${newUsers30d}</td></tr>
    </table>

    ${recentUsers.length > 0 ? `
    <h3 style="font-size: 14px; color: #666; margin: 0 0 8px;">Recent Signups</h3>
    <ul style="font-size: 13px; padding-left: 20px; margin: 0 0 20px;">
      ${recentUsers.map((u) => `<li style="margin-bottom: 4px;"><strong>${u.full_name || u.username || "(no name)"}</strong> <span style="color: #999;">@${u.username} · ${u.created_at?.slice(0, 10)}</span></li>`).join("")}
    </ul>
    ` : ""}

    <h2 style="font-size: 16px; color: #6366f1; margin: 0 0 12px;">💼 Gigs</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 12px;">
      <tr><td style="padding: 4px 0;">Total</td><td style="text-align: right; font-weight: bold;">${totalGigs}</td></tr>
      <tr><td style="padding: 4px 0;">Active</td><td style="text-align: right; color: #16a34a;">${activeGigs}</td></tr>
      <tr><td style="padding: 4px 0;">Draft</td><td style="text-align: right;">${draftGigs}</td></tr>
      <tr><td style="padding: 4px 0;">Filled</td><td style="text-align: right;">${filledGigs}</td></tr>
      <tr><td style="padding: 4px 0;">New (24h)</td><td style="text-align: right; font-weight: bold; color: ${newGigs24h > 0 ? "#16a34a" : "#666"};">${newGigs24h}</td></tr>
      <tr><td style="padding: 4px 0;">New (7d)</td><td style="text-align: right;">${newGigs7d}</td></tr>
      <tr><td style="padding: 4px 0;">New (30d)</td><td style="text-align: right;">${newGigs30d}</td></tr>
    </table>
    ${recentGigList.length > 0 ? `
    <ul style="font-size: 13px; padding-left: 20px; margin: 0 0 20px;">
      ${recentGigList.map((g) => `<li style="margin-bottom: 4px;"><strong>${g.title || "(untitled)"}</strong> <span style="color: #999;">[${g.status}] · ${g.created_at?.slice(0, 10)}</span></li>`).join("")}
    </ul>
    ` : `<div style="margin-bottom: 20px;"></div>`}

    <h2 style="font-size: 16px; color: #6366f1; margin: 0 0 12px;">📋 Applications</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Total</td><td style="text-align: right; font-weight: bold;">${totalApps}</td></tr>
      <tr><td style="padding: 4px 0;">Pending</td><td style="text-align: right;">${pendingApps}</td></tr>
      <tr><td style="padding: 4px 0;">Accepted</td><td style="text-align: right; color: #16a34a;">${acceptedApps}</td></tr>
      <tr><td style="padding: 4px 0;">Rejected</td><td style="text-align: right; color: #dc2626;">${rejectedApps}</td></tr>
      <tr><td style="padding: 4px 0;">New (24h)</td><td style="text-align: right; color: ${newApps24h > 0 ? "#16a34a" : "#666"};">${newApps24h}</td></tr>
      <tr><td style="padding: 4px 0;">New (7d)</td><td style="text-align: right;">${newApps7d}</td></tr>
    </table>

    <h2 style="font-size: 16px; color: #6366f1; margin: 0 0 12px;">📝 Posts & Feed</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Total posts</td><td style="text-align: right; font-weight: bold;">${totalPosts}</td></tr>
      <tr><td style="padding: 4px 0;">New posts (24h)</td><td style="text-align: right; color: ${newPosts24h > 0 ? "#16a34a" : "#666"};">${newPosts24h}</td></tr>
      <tr><td style="padding: 4px 0;">New posts (7d)</td><td style="text-align: right;">${newPosts7d}</td></tr>
      <tr><td style="padding: 4px 0;">Total comments</td><td style="text-align: right;">${totalPostComments}</td></tr>
      <tr><td style="padding: 4px 0;">New comments (24h)</td><td style="text-align: right; color: ${newPostComments24h > 0 ? "#16a34a" : "#666"};">${newPostComments24h}</td></tr>
    </table>

    <h2 style="font-size: 16px; color: #6366f1; margin: 0 0 12px;">🤝 Social</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Follows</td><td style="text-align: right; font-weight: bold;">${totalFollows} <span style="color: #16a34a; font-weight: normal;">+${newFollows24h}</span></td></tr>
      <tr><td style="padding: 4px 0;">Endorsements</td><td style="text-align: right;">${totalEndorsements}</td></tr>
      <tr><td style="padding: 4px 0;">Reviews</td><td style="text-align: right;">${totalReviews} <span style="color: #16a34a; font-weight: normal;">+${newReviews24h}</span></td></tr>
    </table>

    <h2 style="font-size: 16px; color: #6366f1; margin: 0 0 12px;">💬 Messaging</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Conversations</td><td style="text-align: right; font-weight: bold;">${totalConversations} <span style="color: #16a34a; font-weight: normal;">+${newConvos24h}</span></td></tr>
      <tr><td style="padding: 4px 0;">Messages</td><td style="text-align: right;">${totalMessages} <span style="color: #16a34a; font-weight: normal;">+${newMessages24h}</span></td></tr>
    </table>

    <h2 style="font-size: 16px; color: #6366f1; margin: 0 0 12px;">💰 Payments</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 20px;">
      <tr><td style="padding: 4px 0;">Total</td><td style="text-align: right; font-weight: bold;">${totalPayments}</td></tr>
      <tr><td style="padding: 4px 0;">Confirmed</td><td style="text-align: right; color: #16a34a;">${confirmedPayments}</td></tr>
      <tr><td style="padding: 4px 0;">Forwarded</td><td style="text-align: right;">${forwardedPayments}</td></tr>
      <tr><td style="padding: 4px 0;">Pending</td><td style="text-align: right;">${pendingPayments}</td></tr>
      <tr><td style="padding: 4px 0;">New (24h)</td><td style="text-align: right; color: ${newPayments24h > 0 ? "#16a34a" : "#666"};">${newPayments24h}</td></tr>
    </table>

  </div>

  <p style="text-align: center; font-size: 12px; color: #999; margin-top: 16px;">
    Sent by ugig Stats · <a href="https://ugig.net" style="color: #6366f1;">ugig.net</a>
  </p>
</body>
</html>
`.trim();

  return {
    subject: `📊 ugig Daily — ${dateStr} | ${totalUsers} users, ${totalGigs} gigs, ${totalMessages} msgs`,
    html,
    text,
  };
}

// ─── Send via Resend ───────────────────────────────────────────────────────

async function sendViaResend(to: string, subject: string, html: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
    text,
  });
  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
  return data;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`📊 Building ugig.net daily stats report...`);

  const report = await buildReport();

  if (DRY_RUN) {
    console.log(`\nSubject: ${report.subject}\nTo: ${TO_EMAIL}\n`);
    console.log(report.text);
    console.log("\n(dry run — email not sent)");
    return;
  }

  console.log(`📧 Sending to ${TO_EMAIL}...`);
  const result = await sendViaResend(TO_EMAIL, report.subject, report.html, report.text);
  console.log(`✅ Sent! ID: ${result?.id ?? "(unknown)"}`);
}

main().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
