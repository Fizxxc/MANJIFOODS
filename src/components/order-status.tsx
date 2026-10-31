import {
  Clock,
  CheckCircle,
  XCircle,
  CookingPot,
  PackageCheck,
  CircleCheck,
  CircleSlash,
} from "lucide-react";
import { orderLabels, type Event } from "@/lib/domain";

export function OrderStatus({
  status,
  events = [],
  detail = false,
}: {
  status: string;
  events?: Event[];
  detail?: boolean;
}) {
  const Icon =
    {
      pending: Clock,
      confirmed: CheckCircle,
      rejected: XCircle,
      preparing: CookingPot,
      ready: PackageCheck,
      completed: CircleCheck,
      cancelled: CircleSlash,
    }[status] || Clock;
  const reason =
    status === "rejected"
      ? [...events].reverse().find((e) => e.event_type === "reject")?.note
      : null;
  return (
    <div
      className={`order-status status-${status}${detail ? " order-status-detail" : ""}`}
      role="status"
    >
      <Icon
        size={detail ? 28 : 17}
        className="order-status-icon"
        aria-hidden="true"
      />
      <div>
        <strong>{orderLabels[status] || "Status pesanan"}</strong>
        {detail && status === "rejected" && (
          <p>{reason || "Hubungi kantin untuk mengetahui alasan penolakan."}</p>
        )}
      </div>
    </div>
  );
}
