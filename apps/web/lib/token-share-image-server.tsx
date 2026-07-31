import "server-only";

import { ImageResponse } from "next/og";
import { buildTokenIdentityLabel } from "@/lib/seo";
import { readTokenIdentity } from "@/lib/token-identity-server";
import { validateTokenProject } from "@/lib/token-project-server";

export const TOKEN_SHARE_IMAGE_SIZE = {
  width: 1200,
  height: 630,
};

function identityFontSize(identity: string) {
  const length = [...identity].length;
  if (length > 56) return "52px";
  if (length > 38) return "62px";
  return "76px";
}

export async function renderTokenShareImage(address: string) {
  const project = await validateTokenProject(address);
  const isOfficial = project.status === "valid";
  const identityResult = isOfficial
    ? await readTokenIdentity(project.token)
    : null;
  const identity =
    buildTokenIdentityLabel(identityResult?.name, identityResult?.symbol) ??
    "BNBX Token";
  const contractAddress = isOfficial ? project.token.toLowerCase() : null;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "62px 72px",
        color: "#f7f4e6",
        background:
          "radial-gradient(circle at 82% 16%, #354822 0%, #11170d 37%, #060806 73%)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "74px",
              height: "74px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #c7f36a",
              borderRadius: "50%",
              color: "#c7f36a",
              fontSize: "22px",
              fontWeight: 800,
            }}
          >
            BX
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            <span style={{ fontSize: "42px", fontWeight: 900 }}>BNBX</span>
            <span
              style={{
                color: "#c7f36a",
                fontSize: "17px",
                letterSpacing: "4px",
              }}
            >
              BNB CHAIN LAUNCHPAD
            </span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            padding: "10px 18px",
            border: "1px solid #c7f36a",
            borderRadius: "999px",
            color: "#c7f36a",
            fontSize: "16px",
            fontWeight: 800,
            letterSpacing: "2px",
          }}
        >
          {isOfficial ? "OFFICIAL FACTORY TOKEN" : "TOKEN PROJECT"}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <span
          style={{
            maxWidth: "1050px",
            fontSize: identityFontSize(identity),
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-2px",
          }}
        >
          {identity}
        </span>
        <span
          style={{
            color: "#c7f36a",
            fontSize: "22px",
            fontWeight: 800,
            letterSpacing: "3px",
          }}
        >
          BNB CHAIN
        </span>
        {contractAddress ? (
          <span
            style={{
              color: "#aeb8a2",
              fontSize: "21px",
              letterSpacing: "1px",
            }}
          >
            CONTRACT {contractAddress}
          </span>
        ) : (
          <span style={{ color: "#aeb8a2", fontSize: "21px" }}>
            Verify project details on bnbx.meme
          </span>
        )}
      </div>
    </div>,
    TOKEN_SHARE_IMAGE_SIZE,
  );
}
