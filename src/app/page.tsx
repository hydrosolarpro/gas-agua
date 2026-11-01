import { Bike, Flame, MapPin, Store } from "@/components/icons";
import Link from "next/link";
import { BadgeCheck, MapPinned, Smartphone, Wallet } from "lucide-react";
import { Logo } from "@/components/ui";

const FEATURES = [
  { icon: MapPinned, title: "Seguimiento en vivo", text: "Mira en el mapa por dónde viene tu balón o bidón, como en un taxi por app." },
  { icon: Wallet, title: "Paga al recibir", text: "Yape, Plin o efectivo contra-entrega. Sin tarjetas ni sorpresas." },
  { icon: Smartphone, title: "Entra con tu PIN", text: "Con tu cuenta de Google o con tu celular y un PIN de 4 dígitos." },
  { icon: BadgeCheck, title: "Todo bajo control", text: "El dueño ve pedidos, repartidores y pagos validados en un solo panel." },
];

export default function Home() {
  return (
    <main className="min-h-dvh bg-gradient-to-b from-agua-50 via-white to-gas-50">
      <div className="mx-auto flex max-w-5xl flex-col px-5 pb-16">
        <header className="flex items-center justify-between py-5">
          <Logo />
          <Link href="/ingresar" className="btn-outline px-4 py-2 text-sm">
            Ingresar
          </Link>
        </header>

        <section className="grid items-center gap-10 pt-6 md:grid-cols-2 md:pt-14">
          <div>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
              Tu <span className="text-gas-500">gas</span> y tu <span className="text-agua-600">agua</span>, a la puerta y
              en minutos.
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Pide en segundos, sigue al repartidor en el mapa y paga al recibir. Para negocios: gestiona todo tu
              reparto desde el celular.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/ingresar?next=/cliente" className="btn-gas">
                <Flame className="h-5 w-5" /> Pedir gas o agua
              </Link>
              <Link href="/ingresar?next=/bienvenida%3Fnegocio%3D1" className="btn-primary">
                <Store className="h-5 w-5" /> Tengo un negocio
              </Link>
            </div>
          </div>

          <div className="card relative overflow-hidden p-5">
            <div className="flex items-center justify-between">
              <p className="font-bold">Pedido #A7F3C2</p>
              <span className="chip bg-indigo-100 text-indigo-800">En camino</span>
            </div>
            <div className="relative mt-4 h-44 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#e0f2fe_25%,#f1f5f9_25%,#f1f5f9_50%,#e0f2fe_50%,#e0f2fe_75%,#f1f5f9_75%)] bg-[length:40px_40px]">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 170" preserveAspectRatio="none">
                <path d="M30 140 C 90 120, 110 60, 170 70 S 250 40, 270 30" fill="none" stroke="#0891b2" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 10" />
              </svg>
              <span className="marker-pulse absolute left-[52%] top-[36%] flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-white bg-agua-600 "><Bike className="h-5 w-5 text-white" /></span>
              <MapPin className="absolute right-[6%] top-[8%] h-8 w-8 fill-gas-500 text-white" />
            </div>
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="text-sm text-slate-500">Llega en</p>
                <p className="text-2xl font-extrabold text-agua-700">6 min</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Pagas al recibir</p>
                <p className="font-bold">Yape · S/ 45.00</p>
              </div>
            </div>
          </div>
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
      </div>
    </main>
  );
}
