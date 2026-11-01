import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AguaGasExpress",
    short_name: "AguaGas",
    description: "Gas y agua a domicilio con seguimiento en vivo",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#f4f7fb",
    theme_color: "#0891b2",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
