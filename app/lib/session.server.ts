import { createCookieSessionStorage, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { db, users } from "~/db/index.server";

const secret = process.env.SESSION_SECRET;
if (!secret) {
  throw new Error("SESSION_SECRET belum diset di .env");
}

const storage = createCookieSessionStorage<{ userId: string }>({
  cookie: {
    name: "__belleza_session",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 hari
    secrets: [secret],
  },
});

export const { getSession, commitSession, destroySession } = storage;

export async function createUserSession(userId: string, redirectTo: string) {
  const session = await getSession();
  session.set("userId", userId);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export async function logout(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/login", {
    headers: { "Set-Cookie": await destroySession(session) },
  });
}

export async function getOptionalAdmin(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  if (!userId) return null;

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

// Panggil di SETIAP loader dan action admin.
export async function requireAdmin(request: Request) {
  const user = await getOptionalAdmin(request);
  if (!user) throw redirect("/login");
  return user;
}