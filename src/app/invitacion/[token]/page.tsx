"use client";

import { useParams } from "next/navigation";
import { OwnerSignup } from "@/components/OwnerSignup";

// Pantalla a la que llega un dueño desde su enlace de invitación.
export default function Invitacion() {
  const { token } = useParams<{ token: string }>();
  return <OwnerSignup token={token} />;
}
