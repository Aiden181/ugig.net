import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata = {
  title: "Blog · ugig",
  description: "Latest from the ugig team and partners.",
  alternates: { canonical: "/blog" },
};

// ISR — webhook receivers fire asynchronously, so a short cache keeps
// fresh posts visible without dynamic-rendering every request.
export const revalidate = 60;

type Row = {
  slug: string;
  title: string;
  meta_description: string | null;
  published_at: string;
  image_url: string | null;
};

export default async function BlogIndex() {
  const sb = createServiceClient();
  const { data } = await (sb as any)
    .from("blog_posts")
    .select("slug, title, meta_description, published_at, image_url")
    .order("published_at", { ascending: false })
    .limit(200);

  const posts = (data ?? []) as Row[];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 text-foreground">
        <h1 className="text-4xl font-extrabold">Blog</h1>
        <p className="mt-2 text-muted-foreground">
          Tips on freelancing, AI-assisted work, and the gig economy.
        </p>
        {posts.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">
            No posts yet — check back soon.
          </p>
        ) : (
          <ul className="mt-10 space-y-6">
            {posts.map((p) => (
              <li key={p.slug} className="rounded-lg border bg-card p-5">
                <Link
                  href={`/blog/${p.slug}`}
                  className="block text-foreground hover:text-primary transition-colors"
                >
                  <h2 className="text-xl font-bold">{p.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {p.published_at.slice(0, 10)}
                    {p.meta_description ? ` · ${p.meta_description}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
