"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FullLoader } from "@/components/ui";
import { homeFor, preferredRole, useSession } from "@/lib/hooks";

// Envía a cada usuario a su pantalla según su rol.
export default function Inicio() {
  const router = useRouter();
  const { loading, user, profile } = useSession();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/ingresar");
    else if (!profile?.onboarded) router.replace("/bienvenida");
    else router.replace(homeFor(preferredRole(profile)));
  }, [loading, user, profile, router]);

  return <FullLoader text="Abriendo tu cuenta…" />;
}
