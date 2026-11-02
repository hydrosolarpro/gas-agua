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

export default function Home() {
  return (
    <main className="min-h-dvh bg-gradient-to-b from-agua-50 via-white to-gas-50">
      <div className="mx-auto flex max-w-5xl flex-col px-5 pb-16">
        <header className="flex items-center justify-between py-5">
          <Logo />
        </header>

        <section className="grid items-center gap-10 pt-6 md:grid-cols-2 md:pt-14">
          <div>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
              Tu <span className="text-gas-500">gas</span> y tu <span className="text-agua-600">agua</span>, a la puerta y
              en minutos.
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Pide en minutos, sigue al repartidor en el mapa y paga al recibir. Gestiona todo tu reparto desde tu teléfono.
            </p>
            <div className="mt-7">
              <Link href="/ingresar?next=/cliente" className="btn-gas w-full sm:w-auto">
                <Flame className="h-5 w-5" /> Pedir gas o agua
              </Link>
            </div>
            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="text-sm font-semibold text-slate-500">¿Trabajas con un negocio de reparto?</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
                <Link href="/ingresar?rol=dueno" className="btn-outline px-3 text-sm sm:text-base">
                  <Store className="h-5 w-5 text-agua-600" /> Soy dueño
                </Link>
                <Link href="/ingresar?rol=repartidor" className="btn-outline px-3 text-sm sm:text-base">
                  <Bike className="h-5 w-5 text-agua-600" /> Soy repartidor
                </Link>
              </div>
            </div>
          </div>

          <LiveMapDemo />
        </section>

        <section className="mt-16 grid gap-x-10 gap-y-6 border-t border-slate-200 pt-10 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4">
              <Icon className="mt-0.5 h-6 w-6 shrink-0 text-agua-600" />
              <div>
                <p className="font-bold">{title}</p>
                <p className="mt-1 text-slate-600">{text}</p>
              </div>
            </div>
          ))}
        </section>

        <footer className="mt-14 flex items-center justify-between border-t border-slate-200 pt-6 text-sm text-slate-500">
          <p>© AguaGasExpress</p>
          <Link href="/ingresar?rol=admin" className="font-semibold hover:text-slate-800">
            Administrador
          </Link>
        </footer>
      </div>
    </main>
  );
}
