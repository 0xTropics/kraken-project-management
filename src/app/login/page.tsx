import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getInternalSession } from "@/lib/auth/internal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getInternalSession()) redirect("/app");
  const { next } = await searchParams;
  return <LoginForm next={next} />;
}
