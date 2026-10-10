import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/public";
import { businessSettings, db } from "~/db/index.server";

export async function loader() {
  const [row] = await db
    .select({
      name: businessSettings.name,
      tagline: businessSettings.tagline,
      address: businessSettings.address,
      phone: businessSettings.phone,
    })
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);

  return {
    salon: {
      name: row?.name ?? "Belleza Salon",
      tagline: row?.tagline ?? "",
      address: row?.address ?? "",
      phone: row?.phone ?? "",
    },
  };
}

const navItems = [
  { to: "/", label: "Beranda", end: true },
  { to: "/layanan", label: "Layanan", end: false },
  { to: "/cek-booking", label: "Cek Booking", end: false },
];

function navClass({ isActive }: { isActive: boolean }) {
  return `text-sm font-medium transition-colors hover:text-blush-600 ${
    isActive ? "text-blush-600" : "text-plum-700"
  }`;
}

function Brand({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : null;
  return (
    <>
      {parts.join(" ")}
      {last && <> <span className="text-blush-600">{last}</span></>}
    </>
  );
}

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  const { salon } = loaderData;
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-blush-100 bg-ivory/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="font-serif text-xl font-semibold">
            <Brand name={salon.name} />
          </Link>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Navigasi utama">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                {item.label}
              </NavLink>
            ))}
            <Link
              to="/booking"
              className="rounded-full bg-plum-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-plum-700"
            >
              Booking Sekarang
            </Link>
          </nav>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-blush-200 md:hidden"
            aria-label={open ? "Tutup menu" : "Buka menu"}
            aria-expanded={open}
            aria-controls="menu-mobile"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>

        {open && (
          <nav
            id="menu-mobile"
            className="border-t border-blush-100 bg-ivory px-4 py-4 md:hidden"
            aria-label="Navigasi mobile"
          >
            <div className="flex flex-col gap-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={navClass}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
              <Link
                to="/booking"
                onClick={() => setOpen(false)}
                className="rounded-full bg-plum-900 px-5 py-3 text-center text-sm font-medium text-white"
              >
                Booking Sekarang
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-blush-100 bg-ivory-dark">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
          <div>
            <p className="font-serif text-lg font-semibold">{salon.name}</p>
            {salon.tagline && (
              <p className="mt-2 text-sm text-plum-500">{salon.tagline}</p>
            )}
            {salon.address && (
              <p className="mt-3 text-sm text-plum-500">{salon.address}</p>
            )}
            {salon.phone && (
              <p className="mt-1 text-sm text-plum-500">{salon.phone}</p>
            )}
          </div>
          <div className="text-sm">
            <p className="font-medium">Menu</p>
            <ul className="mt-2 space-y-1 text-plum-500">
              <li><Link to="/layanan" className="hover:text-blush-600">Layanan</Link></li>
              <li><Link to="/booking" className="hover:text-blush-600">Booking</Link></li>
              <li><Link to="/cek-booking" className="hover:text-blush-600">Cek Booking</Link></li>
            </ul>
          </div>
          <div className="text-sm text-plum-500">
            <p className="font-medium text-plum-900">Demo</p>
            <p className="mt-2">
              Ini adalah demo proyek portofolio JadikanWeb. Seluruh data salon
              bersifat simulasi.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}