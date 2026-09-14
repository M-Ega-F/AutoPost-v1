import { NextResponse } from "next/server";

import { getUserId } from "@/lib/auth/server";
import { setActiveWorkspaceForUser } from "@/lib/domain/workspaces";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ message: "Please sign in first." }, { status: 401 });

  try {
    const body = (await request.json()) as { workspaceId?: unknown };
    if (typeof body.workspaceId !== "string" || !body.workspaceId) {
      throw new AppError("validation_failed", "Workspace selection is required.");
    }
    const workspace = await setActiveWorkspaceForUser(userId, body.workspaceId);
    return NextResponse.json({ workspace });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.code === "forbidden" ? 403 : error.code === "validation_failed" ? 400 : 500 },
      );
    }
    return NextResponse.json({ message: "We couldn't switch workspaces." }, { status: 500 });
  }
}
