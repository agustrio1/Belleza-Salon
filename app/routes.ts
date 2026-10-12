import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("layouts/public.tsx", [
    index("routes/home.tsx"),
    route("layanan", "routes/layanan.tsx"),
    route("booking", "routes/booking.tsx"),
    route("booking/sukses", "routes/booking-sukses.tsx"),
    route("cek-booking", "routes/cek-booking.tsx"),
  ]),

  route("login", "routes/login.tsx"),
  route("admin/logout", "routes/admin/logout.tsx"),
  route("admin/media-api", "routes/admin/media-api.ts"),

  layout("layouts/admin.tsx", [
    route("admin", "routes/admin/dashboard.tsx"),
    route("admin/booking", "routes/admin/booking.tsx"),
    route("admin/booking/:id", "routes/admin/booking-detail.tsx"),
    route("admin/kalender", "routes/admin/kalender.tsx"),
    route("admin/layanan", "routes/admin/layanan.tsx"),
    route("admin/staf", "routes/admin/staff.tsx"),
    route("admin/staf/:id", "routes/admin/staff-detail.tsx"),
    route("admin/media", "routes/admin/media.tsx"),
    route("admin/jam-operasional", "routes/admin/jam-operasional.tsx"),
    route("admin/pengaturan", "routes/admin/pengaturan.tsx"),
  ]),
] satisfies RouteConfig;