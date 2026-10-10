import { Form, redirect, useNavigation } from "react-router";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/login";
import { db, users } from "~/db/index.server";
import { verifyPassword } from "~/lib/password.server";
import {
  isLoginBlocked,
  loginKeys,
  recordLoginFailure,
} from "~/lib/rate-limit.server";
import { createUserSession, getOptionalAdmin } from "~/lib/session.server";

export function meta() {
  return [{ title: "Login Admin — Belleza Salon" }];
}

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

// Hash palsu supaya waktu respons sama saat email tidak ditemukan
const DUMMY_HASH =
  "scrypt$00000000000000000000000000000000$" + "00".repeat(64);

export async function loader({ request }: Route.LoaderArgs) {
  if (await getOptionalAdmin(request)) throw redirect("/admin");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const parsed = schema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  const genericError = { error: "Email atau password salah." };
  if (!parsed.success) return genericError;

  const keys = loginKeys(request, parsed.data.email);
  if (await isLoginBlocked(keys)) {
    return { error: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  const ok = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? DUMMY_HASH
  );
  if (!user || !ok) {
    await recordLoginFailure(keys);
    return genericError;
  }

  return createUserSession(user.id, "/admin");
}

export default function Login({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-blush-100 bg-white p-8 shadow-soft">
        <h1 className="text-2xl">
          Belleza <span className="text-blush-600">Admin</span>
        </h1>
        <p className="mt-1 text-sm text-plum-500">Masuk untuk mengelola reservasi.</p>

        <Form method="post" className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-blush-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-blush-200 px-3 py-2 text-sm"
            />
          </div>

          {actionData?.error && (
            <p role="alert" className="text-sm text-red-700">{actionData.error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-plum-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-plum-700 disabled:opacity-60"
          >
            {submitting ? "Memproses..." : "Masuk"}
          </button>
        </Form>
      </div>
    </main>
  );
}