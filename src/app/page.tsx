import { Bike, Flame, Store } from "@/components/icons";
import Link from "next/link";
import { BadgeCheck, MapPinned, Smartphone, Wallet } from "lucide-react";
import { LiveMapDemo } from "@/components/LiveMapDemo";
import { Logo } from "@/components/ui";

const FEATURES = [
  { icon: MapPinned, title: "Seguimiento en vivo", text: "Mira en tiempo real en un mapa por dónde viene tu balón o bidón." },
  { icon: Wallet, title: "Paga al recibir", text: "Yape, Plin o efectivo contra-entrega. Sin tarjetas ni sorpresas." },
  { icon: Smartphone, title: "Entra con tu PIN", text: "Con tu teléfono y un PIN de 4 dígitos. Sin contraseñas largas que olvidar." },
  { icon: BadgeCheck, title: "Todo bajo control", text: "El dueño ve pedidos, repartidores y pagos validados en un solo panel." },
];

// La portada cabe en una sola pantalla: el espacio se reparte según el alto disponible.
export default function Home() {
  return (
    <main className="h-full bg-gradient-to-b from-agua-50 via-white to-gas-50">
      <div className="mx-auto flex h-full max-w-6xl flex-col px-5">
        <header className="flex shrink-0 items-center justify-between py-[clamp(0.4rem,1.6dvh,1.25rem)]">
          <Logo />
          <Link href="/ingresar?rol=admin" className="text-xs font-semibold text-slate-400 hover:text-slate-700">
            Administrador
          </Link>
        </header>

        <section className="grid min-h-0 flex-1 content-center items-center gap-[clamp(0.6rem,2.4dvh,2.5rem)] overflow-hidden md:grid-cols-2">
          <div>
            <h1 className="text-[clamp(1.5rem,4.6dvh,3rem)] font-extrabold leading-[1.1] tracking-tight">
              Tu <span className="text-gas-500">gas</span> y tu <span className="text-agua-600">agua</span>, a la puerta y en minutos.
            </h1>
            <p className="mt-[clamp(0.3rem,1.2dvh,1rem)] text-[clamp(0.85rem,1.9dvh,1.125rem)] text-slate-600">
              Pide en minutos, sigue al repartidor en el mapa y paga al recibir. Gestiona todo tu reparto desde tu teléfono.
            </p>
            <div className="mt-[clamp(0.5rem,1.8dvh,1.75rem)]">
              <Link href="/ingresar?next=/cliente" className="btn-gas w-full !py-[clamp(0.6rem,1.8dvh,0.875rem)] sm:w-auto">
                <Flame className="h-5 w-5" /> Pedir gas o agua
              </Link>
            </div>
            <div className="mt-[clamp(0.5rem,1.6dvh,1.5rem)] border-t border-slate-200 pt-[clamp(0.4rem,1.4dvh,1.25rem)]">
              <p className="text-sm font-semibold text-slate-500">¿Trabajas con un negocio de reparto?</p>
              <div className="mt-[clamp(0.3rem,1dvh,0.75rem)] grid grid-cols-2 gap-3 sm:max-w-md">
                <Link href="/ingresar?rol=dueno" className="btn-outline !py-[clamp(0.5rem,1.5dvh,0.875rem)] px-3 text-sm sm:text-base">
                  <Store className="h-5 w-5 text-agua-600" /> Soy dueño
                </Link>
                <Link href="/ingresar?rol=repartidor" className="btn-outline !py-[clamp(0.5rem,1.5dvh,0.875rem)] px-3 text-sm sm:text-base">
                  <Bike className="h-5 w-5 text-agua-600" /> Soy repartidor
                </Link>
              </div>
            </div>
          </div>

          <div className="max-md:[@media(max-height:820px)]:hidden">
            <LiveMapDemo />
          </div>
        </section>

        <section className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 border-t border-slate-200 py-[clamp(0.4rem,1.6dvh,1.25rem)] md:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-2.5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-agua-600" />
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight">{title}</p>
                <p className="mt-0.5 hidden text-xs text-slate-600 md:block">{text}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
