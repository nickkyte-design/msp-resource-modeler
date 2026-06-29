import type { Express, Request, Response } from "express";
import * as db from "../db";
import { supabaseBrowser } from "./supabase";

export function registerAuthRoutes(app: Express) {
  // Supabase handles auth via browser client
  // This is a placeholder for future auth endpoints
  // (e.g., token refresh, logout)
  
  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    res.clearCookie("sb-auth-token");
    res.json({ success: true });
  });
}

export async function createUserIfNotExists(
  userId: string,
  email: string,
  name: string | null,
  accountId: string
) {
  const existing = await db.getUserByUserId(userId);
  if (!existing) {
    await db.createUser({
      userId,
      email,
      name: name || email.split("@")[0],
      accountId,
      role: "user",
    });
  }
}
