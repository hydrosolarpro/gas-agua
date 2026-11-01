import {
  Banknote,
  Bell,
  Bike,
  CircleCheck,
  CircleX,
  Coffee,
  Droplets,
  Flame,
  Hand,
  House,
  Inbox,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  StickyNote,
  Store,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { METHOD } from "@/lib/format";
import type { Category, PaymentMethod } from "@/lib/types";

export {
  Banknote,
  Bell,
  Bike,
  CircleCheck,
  CircleX,
  Coffee,
  Droplets,
  Flame,
  Hand,
  House,
  Inbox,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  StickyNote,
  Store,
  TriangleAlert,
  Wallet,
};

export function CategoryIcon({ category, className = "h-5 w-5" }: { category: Category; className?: string }) {
  if (category === "gas") return <Flame className={className} />;
  if (category === "agua") return <Droplets className={className} />;
  return <Package className={className} />;
}

/** Marca de método de pago: círculo blanco con la inicial (o billete) en el color del método. */
export function MethodMark({ method, className = "h-6 w-6" }: { method: PaymentMethod; className?: string }) {
  const m = METHOD[method];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white text-[0.7em] font-extrabold leading-none ${className}`}
      style={{ color: m.color, boxShadow: `inset 0 0 0 2px ${m.color}` }}
      aria-hidden
    >
      {method === "efectivo" ? <Banknote className="h-[60%] w-[60%]" /> : method === "otro" ? <Wallet className="h-[60%] w-[60%]" /> : m.label[0]}
    </span>
  );
}
