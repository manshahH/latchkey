import Link from "next/link";

import { Key } from "./Key";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="logo" aria-label="Latchkey home">
      <Key seed="latchkey" width={34} />
      <span>Latchkey</span>
    </Link>
  );
}
