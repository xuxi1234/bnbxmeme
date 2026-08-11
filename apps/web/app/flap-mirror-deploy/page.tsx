import { FlapMirrorDeployClient } from "@/components/flap-mirror-deploy-client";
import { resolveAdminSigningWallet } from "@/lib/admin-signing-wallet";
import { resolveFourMirrorAuthorizedWallets } from "@/lib/four-mirror-page-core";

export default function FlapMirrorDeployPage() {
  const authorizedWallet = resolveAdminSigningWallet(
    process.env.BNBX_ADMIN_SIGNING_WALLET,
  );
  const authorizedWallets = resolveFourMirrorAuthorizedWallets(authorizedWallet);
  return <FlapMirrorDeployClient authorizedWallets={authorizedWallets} />;
}
