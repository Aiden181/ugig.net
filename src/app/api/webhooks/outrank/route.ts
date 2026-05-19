// Outrank webhook receiver. Bearer-only auth (no Standard Webhooks
// signature) — we look up the bearer in autoblog_integrations
// (kind='outrank') and upsert each article into blog_posts.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OutrankArticle = {
  id?: string;
  title?: string;
  content_markdown?: string;
  content_html?: string;
  meta_description?: string;
  created_at?: string;
  image_url?: string;
  slug?: string;
  tags?: string[];
};

type OutrankPayload = {
  event_type?: string;
  timestamp?: string;
  data?: { articles?: OutrankArticle[] };
};

function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: integrations, error: lookupErr } = await (supabase as any)
    .from("autoblog_integrations")
    .select("id, access_token")
    .eq("kind", "outrank");
  if (lookupErr) {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  const integration = (integrations ?? []).find(
    (row: { access_token: string }) => tokensMatch(row.access_token, token),
  );
  if (!integration) {
    return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
  }

  let payload: OutrankPayload;
  try {
    payload = (await req.json()) as OutrankPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.event_type !== "publish_articles") {
    try {
      await (supabase as any).rpc("bump_autoblog_integration", {
        integration_id: integration.id,
      });
    } catch {}
    return NextResponse.json({
      message: "Event ignored",
      event_type: payload.event_type ?? null,
    });
  }

  const articles = payload.data?.articles ?? [];
  if (!articles.length) {
    return NextResponse.json({ message: "No articles in payload" });
  }

  const rows = articles
    .filter((a) => a.title)
    .map((a) => {
      const slug = (a.slug && a.slug.trim()) || slugify(a.title || "");
      return {
        source: "outrank",
        source_id: a.id ?? null,
        slug,
        title: a.title!,
        content_markdown: a.content_markdown ?? null,
        content_html: a.content_html ?? null,
        meta_description: a.meta_description ?? null,
        image_url: a.image_url ?? null,
        tags: Array.isArray(a.tags) ? a.tags : [],
        source_created_at: a.created_at ?? null,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

  const { error: upsertErr } = await (supabase as any)
    .from("blog_posts")
    .upsert(rows, { onConflict: "source,source_id" });
  if (upsertErr) {
    console.error("[outrank webhook] upsert failed:", upsertErr);
    return NextResponse.json(
      { error: "Failed to persist articles" },
      { status: 500 },
    );
  }

  try {
    await (supabase as any).rpc("bump_autoblog_integration", {
      integration_id: integration.id,
    });
  } catch {}

  revalidatePath("/blog");

  return NextResponse.json({
    message: "Webhook processed successfully",
    count: rows.length,
  });
}
