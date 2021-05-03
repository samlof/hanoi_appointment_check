const headless = !process.env.PUPPETEER_HEAD;
console.log("Puppeteer options headless: " + headless);

export const puppeteer = {
  headless: headless,
  executablePath: undefined, //"chromium-browser",
};
