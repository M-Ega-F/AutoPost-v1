import { NextResponse } from "next/server";

import { getUserId } from "@/lib/auth/server";
import { getPostSummary } from "@/lib/domain/posts";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await getUserId();
  const { id } = await params;

  if (!userId) {
    return NextResponse.json(
      { message: "Please log in to continue." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const post = await getPostSummary(userId, id);

    if (!post) {
      return NextResponse.json(
        { message: "We couldn't find that post." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { post },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("post fetch failed", {
      postId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { message: "We couldn't load this post. Try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
