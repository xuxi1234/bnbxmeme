import { ImageResponse } from "next/og";

export const alt = "BNBX — BNB Chain Meme Token Launchpad";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "68px 76px",
          color: "#f6f2dd",
          background:
            "radial-gradient(circle at 80% 15%, #3d4d26 0%, #10140c 38%, #070807 72%)",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "22px",
          }}
        >
          <div
            style={{
              width: "84px",
              height: "84px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #c7f36a",
              borderRadius: "50%",
              color: "#c7f36a",
              fontSize: "24px",
              fontWeight: 800,
            }}
          >
            BX
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span style={{ fontSize: "48px", fontWeight: 900 }}>BNBX</span>
            <span
              style={{
                color: "#c7f36a",
                fontSize: "20px",
                letterSpacing: "5px",
              }}
            >
              BNB CHAIN LAUNCHPAD
            </span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <span
            style={{
              maxWidth: "900px",
              fontSize: "70px",
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-3px",
            }}
          >
            Build the next BNB community.
          </span>
          <span style={{ color: "#bec5ad", fontSize: "27px" }}>
            Transparent templates · On-chain bonding curves · Verifiable LP burn
          </span>
        </div>
      </div>
    ),
    size,
  );
}
