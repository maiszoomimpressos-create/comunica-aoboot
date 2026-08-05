"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";

export async function signOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
}
