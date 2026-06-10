import { redirect } from "next/navigation";

// NextAuth's pages.signIn and the middleware both point unauthenticated users
// here. The real login form lives at "/", so forward the callbackUrl along so a
// post-login redirect (e.g. a /join/<slug> invite link) isn't lost.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  redirect(callbackUrl ? `/?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/");
}
