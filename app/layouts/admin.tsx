import { useState } from "react";
import { Form, Link, NavLink, Outlet } from "react-router";
import type { Route } from "./+types/admin";
import { requireAdmin } from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  return { user };
}

const adminNav = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/booking", label: "Booking", end: false },
  { to: "/admin/kalender", label: "Kalender", end: false },
  { to: "/admin/layanan", label: "Layanan", end: false },
  { to: "/admin/jam-operasional", label: "Jam Operasional", end: false },
  { to: "/admin/pengaturan", label: "Pengaturan", end: false },
];

function linkClass({ isActive }: { isActive: boolean }) {
  return `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-blush-100 text-plum-900"
      : "text-plum-500 hover:bg-blush-50 hover:text-plum-900"
  }`;
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const [open, setOpen] = useState(false);
  const { user } = loaderData;

  const nav = (
    <nav className="space-y-1" aria-label="Navigasi admin">
      {adminNav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={linkClass}
          onClick={() => setOpen(false)}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-blush-100 bg-white p-4 md:block">
        <Link to="/admin" className="mb-6 block font-serif text-lg font-semibold">
          Belleza <span className="text-blush-600">Admin</span>
        </Link>
        {nav}
        <Link to="/" className="mt-8 block px-3 text-xs text-plum-500 hover:text-blush-600">
          ← Lihat situs publik
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-blush-100 bg-white px-4">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-blush-200 md:hidden"
            aria-label={open ? "Tutup menu admin" : "Buka menu admin"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
          <p className="hidden text-sm text-plum-500 md:block">Panel pengelolaan Belleza Salon</p>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-plum-500 sm:inline">{user.name}</span>
            <Form method="post" action="/admin/logout">
              <button
                type="submit"
                className="rounded-full border border-blush-200 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-blush-50"
              >
                Keluar
              </button>
            </Form>
          </div>
        </header>

        {open && (
          <div className="border-b border-blush-100 bg-white p-4 md:hidden">{nav}</div>
        )}

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}