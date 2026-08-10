import { FourMirrorDeployClient } from "@/components/four-mirror-deploy-client";
import { resolveAdminSigningWallet } from "@/lib/admin-signing-wallet";
import { resolveFourMirrorAuthorizedWallets } from "@/lib/four-mirror-page-core";

export default function FourMirrorDeployPage() {
  const authorizedWallet = resolveAdminSigningWallet(
    process.env.BNBX_ADMIN_SIGNING_WALLET,
  );
  const authorizedWallets = resolveFourMirrorAuthorizedWallets(authorizedWallet);
  return <FourMirrorDeployClient authorizedWallets={authorizedWallets} />;
}
