/* eslint-disable no-console */
import { getProxies } from "proxy-lists";
import { utils } from "../utils";

const _proxies = new Set<string>();
let running = false;

function initProxies(): void {
  if (running) return;
  running = true;

  getProxies({
    sourcesWhiteList: ["checkerproxy"],
  })
    .on("data", function (proxies) {
      const formatted = proxies.map((x) => `${x.ipAddress}:${x.port}`);
      for (const p of formatted) {
        _proxies.add(p);
      }
    })
    .on("error", function (error) {
      // Some error has occurred.
      // eslint-disable-next-line no-console
      console.log("Error getting proxylist", error);
    })
    .once("end", function () {
      running = false;
    });
}

function getRandomItem<T>(set: Set<T>): T {
  const target = Math.floor(Math.random() * set.size) - 1;

  const it = set.values();
  for (let i = 0; i < target; i++) {
    it.next();
  }
  return it.next().value;
}

export async function getProxy(): Promise<string> {
  if (!running) {
    initProxies();
  }

  while (_proxies.size === 0) await utils.sleep(1000);

  const p = getRandomItem(_proxies);
  if (!p) return await getProxy();
  _proxies.delete(p);

  return p;
}

export function returnProxy(p: string): void {
  _proxies.add(p);
}

// // Backup of list of nordvpn http proxies
// const proxyList = [
//   "https://fi146.nordvpn.com:89",
//   "https://fi155.nordvpn.com:89",
//   "https://fi164.nordvpn.com:89",
//   "https://fi170.nordvpn.com:89",

//   "https://de695.nordvpn.com:89",
//   "https://de863.nordvpn.com:89",
//   "https://de885.nordvpn.com:89",
//   "https://de952.nordvpn.com:89",

//   "https://se391.nordvpn.com:89",
//   "https://se418.nordvpn.com:89",
//   "https://se423.nordvpn.com:89",

//   "https://be188.nordvpn.com:89",
//   "https://be192.nordvpn.com:89",

//   "https://at107.nordvpn.com:89",
//   "https://at125.nordvpn.com:89",
// ];
