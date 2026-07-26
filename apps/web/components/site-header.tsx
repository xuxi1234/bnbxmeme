import Image from "next/image";
import Link from "next/link";
import { WalletButton } from "./wallet-button";

const navigation = [
  ["市场", "/"],
  ["创建代币", "/create"],
  ["今日毕业", "/#graduated"],
  ["历史毕业", "/#graduated"],
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label="BNBX 首页">
        <Image
          className="brand-logo"
          src="/bnbx-logo.png"
          width={40}
          height={40}
          priority
          alt="BNBX"
        />
        <span>
          <strong>BNBX</strong>
          <small>ZERO-TAX LAUNCHPAD</small>
        </span>
      </Link>

      <nav className="desktop-nav" aria-label="主导航">
        {navigation.map(([label, href]) => (
          <Link key={label} href={href}>
            {label}
          </Link>
        ))}
      </nav>

      <div className="header-actions">
        <span className="network-chip">
          <i />
          TESTNET
        </span>
        <WalletButton />
      </div>
      <nav className="mobile-nav" aria-label="移动端导航">
        {navigation.slice(0, 3).map(([label, href]) => (
          <Link key={label} href={href}>{label}</Link>
        ))}
      </nav>
    </header>
  );
}
