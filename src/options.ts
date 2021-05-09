import { utils } from "./utils";

const headless = !process.env.PUPPETEER_HEAD;
// eslint-disable-next-line no-console
console.log(utils.getTimestamp() + "Puppeteer options headless: " + headless);

export const puppeteer = {
  headless: headless,
  executablePath: undefined, //"chromium-browser",
};
