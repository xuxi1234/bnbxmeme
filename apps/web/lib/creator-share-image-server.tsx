import "server-only";

import { ImageResponse } from "next/og";
import {
  buildCreatorIdentityLabel,
  buildCreatorShareImageAlt,
} from "@/lib/seo";
import { validateCreatorProject } from "@/lib/creator-project-server";

export const CREATOR_SHARE_IMAGE_SIZE = {
  width: 1200,
  height: 630,
};

export async function readCreatorShareImageAlt(address: string) {
  const creator = await validateCreatorProject(address);
  return buildCreatorShareImageAlt(
    creator.status === "valid" ? creator.address : null,
  );
}

export async function renderCreatorShareImage(address: string) {
  const creator = await validateCreatorProject(address);
  const isVerified = creator.status === "valid";
  const walletAddress = isVerified ? creator.address.toLowerCase() : null;
  const identity = walletAddress
    ? buildCreatorIdentityLabel(walletAddress)
    : null;

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
          {isVerified ? "VERIFIED CREATOR" : "CREATOR PROFILE"}
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
            fontSize: "76px",
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-2px",
          }}
        >
          {identity ? `Creator ${identity}` : "BNBX Creator"}
        </span>
        <span
          style={{
            color: "#c7f36a",
            fontSize: "22px",
            fontWeight: 800,
            letterSpacing: "3px",
          }}
        >
          BNB CHAIN PROJECT COLLECTION
        </span>
        {walletAddress ? (
          <span
            style={{
              color: "#aeb8a2",
              fontSize: "21px",
              letterSpacing: "1px",
            }}
          >
            WALLET {walletAddress}
          </span>
        ) : (
          <span style={{ color: "#aeb8a2", fontSize: "21px" }}>
            Verify creator projects on bnbx.meme
          </span>
        )}
      </div>
    </div>,
    CREATOR_SHARE_IMAGE_SIZE,
  );
}
