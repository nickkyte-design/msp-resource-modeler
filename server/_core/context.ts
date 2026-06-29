import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { verifyJWT } from "./supabase";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  userId: string | null;
  accountId: string | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let userId: string | null = null;
  let accountId: string | null = null;

  try {
    // Extract JWT from Authorization header
    const authHeader = opts.req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const supabaseUser = await verifyJWT(token);
      
      if (supabaseUser) {
        userId = supabaseUser.id;
        // Get user from database
        user = await db.getUserByUserId(userId);
        if (user) {
          accountId = user.accountId;
        }
      }
    }
  } catch (error) {
    // Authentication is optional for public procedures
    console.error('[Context] Auth error:', error);
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    userId,
    accountId,
  };
}
