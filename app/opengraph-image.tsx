import { ImageResponse } from "next/og";

export const alt = "The Klinique by Dr. Kharyl — Medical and Aesthetic Clinic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const siteUrl = process.env.APP_URL || "http://localhost:3000";
  const logoUrl = new URL("/images/the_klinique_logo-removebg-preview.png", siteUrl).toString();

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", background: "linear-gradient(135deg, #171013 0%, #2b1a20 58%, #6e3949 100%)" }}>
      <div style={{ position: "absolute", width: 520, height: 520, right: -110, top: -180, borderRadius: 999, background: "rgba(224, 159, 177, 0.14)" }} />
      <div style={{ position: "absolute", width: 390, height: 390, left: -130, bottom: -210, borderRadius: 999, border: "2px solid rgba(207, 159, 112, 0.22)" }} />
      <div style={{ width: 980, height: 450, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.13)", borderRadius: 34, background: "rgba(255,255,255,0.055)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" width="650" height="305" style={{ objectFit: "contain" }} />
        <div style={{ display: "flex", marginTop: 8, color: "#efd9df", fontSize: 25, letterSpacing: 6, textTransform: "uppercase" }}>Medical &amp; Aesthetic Clinic</div>
        <div style={{ display: "flex", marginTop: 16, color: "#d9a9b7", fontSize: 21 }}>Cagayan de Oro City · By Appointment Only</div>
      </div>
    </div>,
    size,
  );
}
