import { utils } from "../utils";

/**
 * Get a proxy from pool of usable ones
 * @returns Proxy url
 */
export async function getProxy(): Promise<string> {
  // Sleep until proxy is available
  while (proxyList.length === 0) await utils.sleep(1000);
  const p = proxyList.pop();
  if (!p) throw new Error("Race condition getting proxy?");
  return p;
}

/**
 * Return proxy to pool of usable ones
 * @param p Proxy url
 */
export function returnProxy(p: string): void {
  proxyList.push(p);
}

/**
 * Helper to create possible proxy addresses
 * @returns Proxy list
 */
function nordvpnProxies(): string[] {
  const proxies: string[] = [];
  for (let i = 1; i < 160; i++) {
    proxies.push(
      `https://fi${i}.nordvpn.com:89`,
      `https://de${i}.nordvpn.com:89`,
      `https://se${i}.nordvpn.com:89`,
      `https://be${i}.nordvpn.com:89`,
      `https://at${i}.nordvpn.com:89`
    );
  }
  return proxies;
}

const proxyList = [
  "https://de984.nordvpn.com:89",
  "https://de983.nordvpn.com:89",
  "https://de982.nordvpn.com:89",
  "https://de981.nordvpn.com:89",
  "https://de980.nordvpn.com:89",
  "https://de979.nordvpn.com:89",
  "https://de978.nordvpn.com:89",
];
