export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

const config: Record<BookingStatus, { label: string; className: string }> = {
  pending: { label: "Menunggu Konfirmasi", className: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Dikonfirmasi", className: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Selesai", className: "bg-plum-500/15 text-plum-700" },
  cancelled: { label: "Dibatalkan", className: "bg-red-100 text-red-800" },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, className } = config[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}