import { injectable } from "inversify";
import { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer-extra";
import Adblocker from "puppeteer-extra-plugin-adblocker";
// @ts-ignore this doesn't have types
import AnonymizeUaPlugin from "puppeteer-extra-plugin-anonymize-ua";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import {
  AntiCaptchaService,
  Captcha,
  captchaFolder,
} from "../captcha/anticaptcha/antiCaptchaService";
import { Country } from "../countries";
import { Logger } from "../logger";
import * as options from "../options";
import { TelegrafService } from "../telegram/telegrafService";
import { utils } from "../utils";
import { getProxy, returnProxy } from "../proxy/proxyList";

puppeteer.use(StealthPlugin());
puppeteer.use(Adblocker({ blockTrackers: true }));
puppeteer.use(AnonymizeUaPlugin());

export const loginPageUrl =
  "https://online.vfsglobal.com/FinlandAppt/Account/RegisteredLogin?q=shSA0YnE4pLF9Xzwon/x/FXkgptUe6eKckueax3hilyMCJeF9rpsVy6pNcXQaW1lGwqZ09Q3CAT0LslshZBx5g==";
const registerPageUrl =
  "https://online.vfsglobal.com/FinlandAppt/Account/RegisterUser";

const waitForNavigationTimeout = 5 * 60 * 1000;

const NordVpnUsername = process.env.NORDVPN_USERNAME;
const NordVpnPassword = process.env.NORDVPN_PASSWORD;
const UseProxy = !!process.env.USE_PROXY;

@injectable()
export class PuppetService {
  constructor(
    private telegrafService: TelegrafService,
    private captchaService: AntiCaptchaService,
    private logger: Logger
  ) {
    this.logger.init("PuppetService");
  }

  foundFreeDate = false;
  imagesSent = false;
  proxyUrl?: string;

  /**
   * @param {string} email
   * @param {string} password
   * @returns {Promise<[string]>} cookie string
   */
  public async Login(
    page: Page,
    email: string,
    password: string
  ): Promise<string> {
    await page.goto(loginPageUrl);

    const el = await page.$("#CaptchaImage");
    const filename = `${captchaFolder}/loginCaptcha${Date.now()}.png`;
    await el?.screenshot({ path: filename });

    let captcha: Captcha | undefined;
    for (let i = 0; i < 5 && !captcha; i++) {
      captcha = await this.captchaService.solveCaptcha(filename);
    }
    if (!captcha) {
      throw new Error("Failed to solve captcha even after 5 tries");
    }

    // @ts-ignore because it's input
    await page.$eval("#EmailId", (el, email) => (el.value = email), email);
    await page.$eval(
      "#Password",
      // @ts-ignore because it's input
      (el, password) => (el.value = password),
      password
    );
    await page.waitForTimeout(500);

    await page.$eval(
      "#CaptchaInputText",
      // @ts-ignore because it's input
      (el, captcha) => (el.value = captcha),
      captcha.answer
    );
    await page.waitForTimeout(500);

    await Promise.all([
      page.click(".submitbtn"),
      page.waitForNavigation({ timeout: waitForNavigationTimeout }),
    ]);
    await page.waitForTimeout(500);

    if (
      page.url().includes("https://online.vfsglobal.com/FinlandAppt/Home/Index")
    ) {
      // Login succeeded
      // @ts-ignore because we need to access it
      const { cookies } = await page._client.send("Network.getAllCookies");
      const cookieString = cookies
        .map((x: any) => `${x.name}=${x.value}`)
        .join("; ");
      this.captchaService.reportGood(captcha.captchaId);
      return cookieString;
    }

    let errors: string | null = null;
    try {
      // We got an error. Check it and report
      errors = await page.$eval(
        ".validation-summary-errors",
        (el) => el && el.textContent
      );
    } catch (error) {
      // Errors wasn't found. Some unknown error. Reported after
    }

    if (errors?.includes("verification words are incorrect")) {
      this.captchaService.reportBad(captcha.captchaId, filename);

      // Should try again since problem will fix itself
      await utils.sleep(1000);
      // Clear all cookies
      const client = await page.target().createCDPSession();
      await client.send("Network.clearBrowserCookies");
      await client.send("Network.clearBrowserCache");
      await client.detach();
      return this.Login(page, email, password);
    }
    if (errors) {
      throw new Error("Failed to login. Error: " + errors);
    }

    this.telegrafService.sendMe("Failed to login. No error");
    await page.screenshot({ path: "errorLoggingIn.png" });
    this.telegrafService.sendImageMeFileName("errorLoggingIn.png");
    throw new Error("Failed to login. No error");
  }

  public async makeNewAccount(
    page: Page,
    accountInfo: AccountInfo
  ): Promise<void> {
    await page.goto(loginPageUrl);
    await utils.sleep(1000);

    await Promise.all([
      page.waitForNavigation({ timeout: waitForNavigationTimeout }),
      page.click("#NewUser"),
    ]);
    await page.waitForTimeout(1000);

    const filename = `${captchaFolder}/registerCaptcha${Date.now()}.png`;
    const el = await page.$("#CaptchaImage");
    await el?.screenshot({ path: filename });

    await page.$eval(
      "#FirstName",
      // @ts-ignore because it's input
      (el, FirstName) => (el.value = FirstName),
      accountInfo.FirstName
    );
    await page.$eval(
      "#LastName",
      // @ts-ignore because it's input
      (el, LastName) => (el.value = LastName),
      accountInfo.LastName
    );
    await page.$eval(
      "#validateEmailId",
      // @ts-ignore because it's input
      (el, validateEmailId) => (el.value = validateEmailId),
      accountInfo.Email
    );
    await page.$eval(
      "#ContactNo",
      // @ts-ignore because it's input
      (el, ContactNo) => (el.value = ContactNo),
      accountInfo.PhoneNumber
    );
    await page.$eval(
      "#Password",
      // @ts-ignore because it's input
      (el, Password) => (el.value = Password),
      accountInfo.Password
    );
    await page.$eval(
      "#ConfirmPassword",
      // @ts-ignore because it's input
      (el, ConfirmPassword) => (el.value = ConfirmPassword),
      accountInfo.Password
    );

    await page.click("#IsChecked");
    await page.waitForTimeout(500);
    await page.click("span.ui-button-icon-primary.ui-icon.ui-icon-closethick");

    let captcha = await this.captchaService.solveCaptcha(filename);
    for (let i = 0; i < 5 && !captcha; i++) {
      await utils.sleep(5000);
      captcha = await this.captchaService.solveCaptcha(filename);
    }
    if (!captcha) {
      throw new Error("Failed to get captcha");
    }

    await page.$eval(
      "#CaptchaInputText",
      // @ts-ignore because it's input
      (el, captcha) => (el.value = captcha),
      captcha.answer
    );

    // Submit will open a dialog. Accept it
    const diabloAccepter = (dialog: any) => {
      dialog.accept();
    };
    page.on("dialog", diabloAccepter);

    await page.waitForTimeout(500);
    await Promise.all([
      await page.click(`input[type="submit"]`),
      page.waitForNavigation({ timeout: waitForNavigationTimeout }),
    ]);
    // Remove dialog accepter.
    page.off("dialog", diabloAccepter);
    await page.waitForTimeout(500);

    if (page.url().includes(registerPageUrl)) {
      // We got an error. Check it and report
      let errors: string | null = null;
      try {
        errors = await page.$eval(
          ".validation-summary-errors",
          (el) => el && el.textContent
        );
      } catch (error) {
        // No error. Ignore
      }
      if (errors?.includes("Invalid reCAPTCHA request")) {
        this.captchaService.reportBad(captcha.captchaId, filename);
        await utils.sleep(1000);
        await this.makeNewAccount(page, accountInfo);
        return;
      }
      if (!errors) {
        await page.screenshot({ path: "register_unknown_error.png" });
        this.telegrafService.sendImageMeFileName("register_unknown_error.png");
      }
      this.telegrafService.sendMe(
        "Failed to create account. Error happened: " + errors
      );
      throw new Error("Didn't move to next page. Error happened");
    }

    // Navigated to correct page. Check if registered message is there
    try {
      const resContent = await page.$eval(
        ".SubContainer",
        (el) => el.textContent
      );
      if (
        !resContent ||
        !resContent.includes("Registration done successfully")
      ) {
        // Something went wrong. Probably captcha
        this.telegrafService.sendMe(`Failed to create account. Unknown error`);
        throw new Error("Error happened");
      }
    } catch (error) {
      const errmsg =
        "Failed to create account. Couldn't find .SubContainer: " +
        JSON.stringify(error);
      this.logger.error(errmsg);
      this.telegrafService.sendMe(errmsg);
      await page.screenshot({ path: "SubContainer_error.png" });
      throw new Error("Error finding SubContainer");
    }

    // Login succeeded
    this.captchaService.reportGood(captcha.captchaId);
  }

  private readonly loginHomePageUrl =
    "https://online.vfsglobal.com/FinlandAppt/Home/Index";
  /**
   * @returns Error
   */
  public async GotoCalendarPage(
    page: Page,
    info: ApplicantInfo,
    seatCategory: SeatCategory
  ): Promise<void> {
    if (page.url() !== this.loginHomePageUrl) {
      await page.goto(this.loginHomePageUrl);
    }
    if (page.url() !== this.loginHomePageUrl) {
      throw new Error("GotoCalendarPage: Invalid url cannot get to home page");
    }

    const linkHandlers = await page.$x(
      "//a[contains(text(), 'Schedule Appointment')]"
    );
    if (linkHandlers.length === 0) {
      throw new Error(
        "GotoCalendarPage: Cannot find link for scheduling appointment"
      );
    }

    await Promise.all([
      page.waitForNavigation({ timeout: waitForNavigationTimeout }),
      linkHandlers[0].click(),
    ]);
    await page.waitForTimeout(500);
    if (page.url().includes("RegisteredLogin")) {
      throw new Error("Invalid url when filling applicant form");
    }

    this.logger.log("Filling location and category id");

    await page.select("#LocationId", "33");
    await page.waitForTimeout(500);

    // const _locError = await page.$eval("#LocationError", (el) => el.textContent);
    // No need to check seats error
    // if (locError?.includes("There are no open seats")) {
    //   throw new Error( "no open seats");
    // }
    await page.select("#VisaCategoryId", seatCategory);
    await page.waitForTimeout(500);

    // Debug code to bypass no seats available
    await page.$eval(
      "#btnContinue",
      (el) =>
        // @ts-ignore because it's a button
        (el.disabled = false)
    );

    // Go to applicant page
    await Promise.all([
      page.waitForNavigation({ timeout: waitForNavigationTimeout }),
      page.click("#btnContinue"),
    ]);
    await page.waitForTimeout(500);

    // Go to add applicant page
    await Promise.all([
      page.waitForNavigation({ timeout: waitForNavigationTimeout }),
      page.click(".submitbtn"),
    ]);
    await page.waitForTimeout(500);

    this.logger.log("Filling applicant info");
    await this.FillApplicantForm(page, info);

    // Go to calendar page
    await Promise.all([
      page.waitForNavigation({ timeout: waitForNavigationTimeout }),
      page.click("input[type='submit']"),
    ]);
  }

  /**
   *
   * @param page Page object that is at applicants page with applicant filled.
   * @returns Error
   */
  public async CheckCalendarDays(page: Page): Promise<AvailablyDaysResult> {
    // Keep checking calendar while we are on it's page

    if (
      page.url() !==
      "https://online.vfsglobal.com/FinlandAppt/Calendar/FinalCalendar"
    ) {
      throw new Error("Invalid url for checking calendar days");
    }
    await page.reload({
      timeout: waitForNavigationTimeout,
      waitUntil: "networkidle2",
    });
    if (
      page.url() !==
      "https://online.vfsglobal.com/FinlandAppt/Calendar/FinalCalendar"
    ) {
      throw new Error("Invalid url for checking calendar days");
    }

    const ret: AvailablyDaysResult = { dates: [], images: [] };
    let avdays = await this.checkCalendarElement(page);
    if (avdays) {
      ret.dates.push(...avdays);

      // const calendarEl = await page.$("#calendar");
      // const calendarPic = await calendarEl?.screenshot();
      // ret.images.push(calendarPic);
    }

    try {
      await page.waitForSelector(".fc-header-right .fc-button", {
        timeout: 30 * 1000,
      });
    } catch (error) {
      // Ignore error
    }

    try {
      await page.click(".fc-header-right .fc-button");
    } catch (error) {
      const sc = await page.screenshot();
      if (sc) this.telegrafService.sendImageMe(sc);
      throw error;
    }

    avdays = await this.checkCalendarElement(page);
    if (avdays) {
      ret.dates.push(...avdays);

      // const calendarEl = await page.$("#calendar");
      // const calendarPic = await calendarEl?.screenshot();
      // ret.images.push(calendarPic);
    }

    try {
      await page.waitForSelector(".fc-header-right .fc-button", {
        timeout: 30 * 1000,
      });
    } catch (error) {
      // Ignore error
    }
    await page.click(".fc-header-right .fc-button");
    await page.waitForTimeout(3 * 1000);

    avdays = await this.checkCalendarElement(page);
    if (avdays) {
      ret.dates.push(...avdays);

      // const calendarEl = await page.$("#calendar");
      // const calendarPic = await calendarEl?.screenshot();
      // ret.images.push(calendarPic);
    }

    return ret;
  }

  /**
   * @returns Available date strings. Ex  2021-05-12 YYYY-MM-DD
   */
  private async checkCalendarElement(
    page: Page
  ): Promise<string[] | undefined> {
    if (page.url().includes("RegisteredLogin")) {
      throw new Error("Invalid url when checking calendar element");
    }

    let backgroundStyles = await page.$$eval("td.fc-day", (ell) =>
      ell.map((el) => ({
        // @ts-ignore el should always have style
        bg: el.style.backgroundColor,
        // @ts-ignore el should always have dataset
        date: el.dataset.date,
      }))
    );
    // Filter empty styles
    backgroundStyles = backgroundStyles.filter((x) => x.bg !== "");
    // Filter white
    backgroundStyles = backgroundStyles.filter(
      (x) => x.bg !== "rgb(255, 255, 255)" && x.bg !== "white"
    );
    // Filter holidays
    backgroundStyles = backgroundStyles.filter(
      (x) => x.bg !== "rgb(204, 204, 204)"
    );
    // Filter weekly offs
    backgroundStyles = backgroundStyles.filter(
      (x) => x.bg !== "rgb(255, 106, 106)"
    );

    // No interesting days on calendar
    if (backgroundStyles.length === 0) {
      return undefined;
    }

    // Available dates should be 188, 237, 145. Any other are unknown
    const unknownColor = backgroundStyles.find(
      (x) => x.bg !== "rgb(188, 237, 145)"
    );
    if (unknownColor) {
      const msg =
        "Found unknown color on day calendar: " +
        JSON.stringify(unknownColor, null, 2);
      this.telegrafService.sendMe(msg);
      this.logger.log(msg);
      const errImg = await page.screenshot();
      if (errImg) this.telegrafService.sendImageMe(errImg);
    }

    // Filter for only green dates
    backgroundStyles = backgroundStyles.filter(
      (x) => x.bg === "rgb(188, 237, 145)"
    );
    if (backgroundStyles.length === 0) {
      return undefined;
    }

    // Return the available dates
    return backgroundStyles.map((x) => x.date);
  }

  async FillApplicantForm(page: Page, info: ApplicantInfo): Promise<void> {
    if (page.url().includes("RegisteredLogin")) {
      throw new Error("Invalid url when filling applicant form");
    }

    await page.$eval(
      "#PassportNumber",
      // @ts-ignore because it's input
      (el, PassportNumber) => (el.value = PassportNumber),
      info.PassportNumber
    );
    await page.$eval(
      "#DateOfBirth",
      // @ts-ignore because it's input
      (el, DateOfBirth) => (el.value = DateOfBirth),
      info.DateOfBirth
    );
    await page.$eval(
      "#PassportExpiryDate",
      // @ts-ignore because it's input
      (el, PassportExpirt) => (el.value = PassportExpirt),
      info.PassportExpirt
    );

    // Do nationality
    await page.select("#NationalityId", info.Nationality);

    await page.$eval(
      "#FirstName",
      // @ts-ignore because it's input
      (el, FirstName) => (el.value = FirstName),
      info.FirstName
    );
    await page.$eval(
      "#LastName",
      // @ts-ignore because it's input
      (el, LastName) => (el.value = LastName),
      info.LastName
    );

    // Do gender
    await page.select("#GenderId", info.Gender);

    await page.$eval(
      "#DialCode",
      // @ts-ignore because it's input
      (el, DialCode) => (el.value = DialCode),
      info.DialCode
    );
    await page.$eval(
      "#Mobile",
      // @ts-ignore because it's input
      (el, Mobile) => (el.value = Mobile),
      info.ContactNumber
    );
    await page.$eval(
      "#validateEmailId",
      // @ts-ignore because it's input
      (el, Email) => (el.value = Email),
      info.Email
    );

    await Promise.all([
      page.waitForNavigation({ timeout: waitForNavigationTimeout }),
      page.click("#submitbuttonId"),
    ]);
    await page.waitForTimeout(200);
  }

  /**
   * Can only have one browser open at a time with this call.
   * @returns puppeteer browser and page
   */
  public async getBrowser(
    datadir: string | undefined = undefined,
    proxy: string | undefined = undefined
  ): Promise<[Browser, Page]> {
    if (!proxy && UseProxy) {
      proxy = await getProxy();
    }
    const browserArgs = ["--no-sandbox", "--disable-setuid-sandbox"];
    this.proxyUrl = proxy;
    if (this.proxyUrl) {
      this.logger.log("Activating proxy");
      browserArgs.push(`--proxy-server=` + this.proxyUrl);
    }

    const browser = await puppeteer.launch({
      // @ts-ignore because types are wrong
      headless: options.puppeteer.headless,

      args: browserArgs,
      ignoreHTTPSErrors: true,
      executablePath: options.puppeteer.executablePath,
      userDataDir: datadir,
    });
    const page = await browser.newPage();
    // Adjustments particular to this page to ensure we hit desktop breakpoint.
    await page.setViewport({ width: 1000, height: 600, deviceScaleFactor: 1 });

    // Authenticate proxy
    if (this.proxyUrl) {
      if (!NordVpnUsername || !NordVpnPassword) {
        throw Error(
          "NordVpn envs NORDVPN_USERNAME and NORDVPN_PASSWORD not set"
        );
      }
      await page.authenticate({
        username: NordVpnUsername,
        password: NordVpnPassword,
      });
    }

    return [browser, page];
  }

  public async closeBrowser(browser: Browser, page: Page): Promise<void> {
    if (this.proxyUrl) {
      returnProxy(this.proxyUrl);
      this.proxyUrl = undefined;
    }

    page.removeAllListeners();
    browser.removeAllListeners();
    await page.close();
    await browser.close();
  }
}

export interface AccountInfo {
  FirstName: string;
  LastName: string;
  Email: string;
  PhoneNumber: string;
  Password: string;
}

export interface ApplicantInfo {
  PassportNumber: string;
  DateOfBirth: string; // DD/MM/YYYY,
  PassportExpirt: string; // DD/MM/YYY,
  Nationality: Country;
  FirstName: string;
  LastName: string;
  Gender: Gender;
  DialCode: string;
  ContactNumber: string;
  Email: string;
}

export enum SeatCategory {
  Legalization = "1174", //"Legalization and notary certificates",
  Passport = "1173", //"Passport/ID card",
  PopulationData = "1175", //"Registration for population data(birth, marriage)",
  RPStudent = "1172", //"Residence pemit STUDENT/DU HOC",
  RPFamily = "1205", //"Residence permit FAMILY/GIA DINH",
  RPWork = "1171", //"Residence permit WORK/LAO DONG",
  Visa = "1206", //"SCHENGEN VISA",
}

export enum Gender {
  Female = "2",
  Male = "1",
  Others = "3",
}

interface AvailablyDaysResult {
  dates: string[];
  images: (string | void | Buffer | undefined)[];
}
