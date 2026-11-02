import { distanceM } from "@/lib/geo";
import type { LatLng } from "@/lib/types";

/** A esta distancia (metros) del punto de entrega se considera que el repartidor llegó. */
export const ARRIVAL_M = 80;

export const hasArrived = (driver: LatLng | null | undefined, destination: LatLng | null | undefined) =>
  Boolean(driver && destination && distanceM(driver, destination) <= ARRIVAL_M);
