import puppeteer from "puppeteer-extra";
import { Browser, HTTPRequest, HTTPResponse, Page } from "puppeteer";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

import * as utils from "../utils";
import * as options from "../options";
import { RetError } from "../error";
import { Country } from "../countries";
import { Captcha, captchaFolder, CaptchaService } from "../captchaService";
import { TelegrafService } from "../telegram/telegrafService";
import { injectable } from "inversify";
import { Logger } from "../logger";

const loginPageUrl =
  "https://online.vfsglobal.com/FinlandAppt/Account/RegisteredLogin?q=shSA0YnE4pLF9Xzwon/x/FXkgptUe6eKckueax3hilyMCJeF9rpsVy6pNcXQaW1lGwqZ09Q3CAT0LslshZBx5g==";
const registerPageUrl =
  "https://online.vfsglobal.com/FinlandAppt/Account/RegisterUser";

@injectable()
export class PuppetService {
  constructor(
    private telegrafService: TelegrafService,
    private captchaService: CaptchaService,
    private logger: Logger
  ) {}

  foundFreeDate = false;
  imagesSent = false;

  /**
   * @param {string} email
   * @param {string} password
   * @returns {Promise<[string]>} cookie string
   */
  public async getPageCookies(
    email: string,
    password: string
  ): Promise<string> {
    const [browser, page] = await this.getBrowser();
    let res = "";
    try {
      res = await this.internalGetPageCookies(page, email, password);
    } catch (error) {
      this.telegrafService.sendMe(`Exception trying to get cookies: ${error}`);
    }
    browser.close();

    return res;
  }

  /**
   * @param {string} email
   * @param {string} password
   * @returns {Promise<[string]>} cookie string
   */
  async internalGetPageCookies(
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
      try {
        captcha = await this.captchaService.solveCaptcha(filename);
      } catch (error) {
        await utils.sleep(500);
      }
    }
    if (!captcha) {
      this.telegrafService.sendMe("Failed to solve captcha even in 5 tries");
      return "";
    }

    // @ts-ignore because it's input
    await page.$eval("#EmailId", (el, email) => (el.value = email), email);
    await page.$eval(
      "#Password",
      // @ts-ignore because it's input
      (el, password) => (el.value = password),
      password
    );
    await page.waitForTimeout(1000);

    await page.$eval(
      "#CaptchaInputText",
      // @ts-ignore because it's input
      (el, captcha) => (el.value = captcha),
      captcha.answer
    );
    await page.waitForTimeout(1000);

    await Promise.all([page.click(".submitbtn"), page.waitForNavigation()]);
    await page.waitForTimeout(1000);

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
      return this.internalGetPageCookies(page, email, password);
    }
    if (errors) {
      this.telegrafService.sendMe("Failed to login. Error: " + errors);
      return "";
    }

    this.telegrafService.sendMe("Failed to login. No error");
    await page.screenshot({ path: "errorLoggingIn.png" });
    this.telegrafService.sendImageMe("errorLoggingIn.png");
    return "";
  }

  /**
   * @returns Error
   */
  public async makeNewAccount(accountInfo: AccountInfo): Promise<RetError> {
    const [browser, page] = await this.getBrowser();
    page.on("dialog", (dialog) => {
      dialog.accept();
    });

    await page.goto(loginPageUrl);
    await utils.sleep(1000);

    await Promise.all([page.waitForNavigation(), page.click("#NewUser")]);
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
      browser.close();
      return "Failed to get captcha";
    }

    await page.$eval(
      "#CaptchaInputText",
      // @ts-ignore because it's input
      (el, captcha) => (el.value = captcha),
      captcha.answer
    );

    await page.waitForTimeout(500);
    await Promise.all([
      await page.click(`input[type="submit"]`),
      page.waitForNavigation(),
    ]);
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
        browser.close();
        await utils.sleep(1000);
        return this.makeNewAccount(accountInfo);
      }
      if (!errors) {
        await page.screenshot({ path: "register_unknown_error.png" });
        this.telegrafService.sendImageMe("register_unknown_error.png");
      }
      this.telegrafService.sendMe(
        "Failed to create account. Error happened: " + errors
      );
      await browser.close();
      return "Didn't move to next page. Error happened";
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
        browser.close();
        return "Error happened";
      }
    } catch (error) {
      const errmsg =
        "Failed to create account. Couldn't find .SubContainer: " +
        JSON.stringify(error);
      this.logger.error(errmsg);
      this.telegrafService.sendMe(errmsg);
      await page.screenshot({ path: "SubContainer_error.png" });
      browser.close();
      return "Error finding SubContainer";
    }

    // Login succeeded
    this.captchaService.reportGood(captcha.captchaId);
    browser.close();
    return "";
  }

  /**
   * @returns Error
   */
  public async ReserveSeat(
    email: string,
    password: string,
    info: ApplicantInfo
  ): Promise<RetError> {
    const [browser, page] = await this.getBrowser();
    const cookies = await this.internalGetPageCookies(page, email, password);
    if (!cookies) {
      // Error happened.
      browser.close();
      return "Couldn't log in";
    }

    await page.waitForTimeout(2000);

    if (page.url() !== "https://online.vfsglobal.com/FinlandAppt/Home/Index") {
      // We are at wrong url. Error
      this.logger.error("ReserveSeat: wrong url after logging in.");
      browser.close();
      return "ReserveSeat: wrong url after logging in.";
    }
    const linkHandlers = await page.$x(
      "//a[contains(text(), 'Schedule Appointment')]"
    );
    if (linkHandlers.length === 0) {
      this.logger.error("Link for Schedule Appointment not found");
      browser.close();
      return "ReserveSeat: wrong url after logging in.";
    }

    await Promise.all([page.waitForNavigation(), linkHandlers[0].click()]);
    await page.waitForTimeout(500);

    await page.select("#LocationId", "33");
    await page.waitForTimeout(500);

    // const _locError = await page.$eval("#LocationError", (el) => el.textContent);
    // No need to check seats yet
    // if (locError?.includes("There are no open seats")) {
    //   return "no open seats";
    // }
    await page.select("#VisaCategoryId", SeatCategory.RPFamily);
    await page.waitForTimeout(500);

    // Debug code to bypass no seats available
    await page.$eval(
      "#btnContinue",
      (el) =>
        // @ts-ignore because it's a button
        (el.disabled = false)
    );

    // Go to applicant page
    await Promise.all([page.waitForNavigation(), page.click("#btnContinue")]);
    await page.waitForTimeout(500);

    // Go to add applicant page
    await Promise.all([page.waitForNavigation(), page.click(".submitbtn")]);
    await page.waitForTimeout(500);

    await this.FillApplicantForm(page, info);

    try {
      const res = await this.checkRequestDatesLoop(page);

      return res;
    } catch (error) {
      return "Got error: " + JSON.stringify(error) + " at: " + error.stack;
    } finally {
      await browser.close();
    }
  }

  /**
   *
   * @param page Page object that is at applicants page with applicant filled.
   * @returns Error
   */
  async checkRequestDatesLoop(page: Page): Promise<RetError> {
    let imagesSaved = false;

    // Setup checking ajax calls responses
    await page.setRequestInterception(true);

    const responseChecker = async (response: HTTPResponse) => {
      // Only interested in CalendarDays calls
      if (
        !response
          .url()
          .startsWith(
            "https://online.vfsglobal.com/FinlandAppt/Calendar/GetCalendarDaysOnViewChange"
          )
      ) {
        return;
      }

      if (!response.ok()) return;

      try {
        this.logger.log(`foundFreeDate is ${this.foundFreeDate}.`);
        const resJson = await response.json();
        const dates: any[] = JSON.parse(resJson.CalendarDatesOnViewChange);
        this.logger.log(`Found ${dates.length} entries in ajax`);
        const availableDates = dates.filter(
          (x) => !x.IsHoliday && !x.IsWeekend
        );
        if (availableDates.length === 0) {
          if (this.foundFreeDate) {
            // const msg = "Seats stopped being available";
            // telegrafService.sendChat(msg);
            // telegrafService.sendBroadcast(msg);
            // foundFreeDate = false;
          }
          // imagesSent = false;
          this.logger.log("No available dates in calendar json");
          return;
        }
        // We have available dates!
        const debugInfo = JSON.stringify(availableDates);
        this.logger.log(`Found available dates! ${debugInfo}`);
        if (this.foundFreeDate) return;

        this.telegrafService.sendMe("Dates: " + debugInfo);
        const msg = `Available dates found in calendar. Visit https://online.vfsglobal.com/FinlandAppt/Account/RegisteredLogin?q=shSA0YnE4pLF9Xzwon/x/FXkgptUe6eKckueax3hilyMCJeF9rpsVy6pNcXQaW1lGwqZ09Q3CAT0LslshZBx5g== to try to reserve a place`;
        this.telegrafService.sendChat(msg);
        this.telegrafService.sendBroadcast(msg);
        this.foundFreeDate = true;
        for (let i = 0; i < 5 && !imagesSaved; i++) {
          await utils.sleep(2000);
        }
        if (!imagesSaved) {
          this.logger.log("No new images even after waiting 10 seconds");
          return;
        }
        if (!this.imagesSent) {
          await this.telegrafService.sendImageChat("calendar1.png");
          await this.telegrafService.sendImageChat("calendar2.png");
          this.imagesSent = true;
        }
      } catch (error) {
        const msg = `Error intercepting calendar days message: ${JSON.stringify(
          error
        )}`;
        this.logger.error(msg);
        this.telegrafService.sendMe(msg);
      }
    };
    const requestContinuerer = (interceptedRequest: HTTPRequest) => {
      interceptedRequest.continue();
    };
    page.on("request", requestContinuerer);
    page.on("response", responseChecker);

    // We are at Applicant list page. Click Continue to get to seat reservation
    try {
      await Promise.all([
        page.waitForNavigation(),
        page.click("input[type='submit']"),
      ]);
    } catch (error) {
      this.logger.error(
        "Error going to calendar page: " + JSON.stringify(error)
      );
      throw error;
    }

    // Keep checking calendar while we are on it's page
    while (
      page.url() ===
      "https://online.vfsglobal.com/FinlandAppt/Calendar/FinalCalendar"
    ) {
      try {
        await page.waitForSelector("#calendar", { timeout: 5000 });
      } catch (error) {
        // Ignore timeout error
      }
      await page.waitForTimeout(3 * 1000);
      //await page.waitForTimeout(* 1000);

      await this.checkCalendarPage(page, "calendar1.png");

      await page.click(".fc-header-right .fc-button");
      await page.waitForTimeout(3 * 1000);

      await this.checkCalendarPage(page, "calendar2.png");

      imagesSaved = true;
      await page.waitForTimeout(40 * 1000);
      imagesSaved = false;

      await page.reload({ waitUntil: "networkidle2" });
    }

    await page.waitForTimeout(1 * 1000);
    this.logger.log("Removing request listeners");
    // Remove intercepting requests
    await page.setRequestInterception(false);
    page.removeAllListeners("request");
    page.removeAllListeners("response");

    return ErrSessionExpired;
  }

  async checkCalendarPage(page: Page, filename: string): Promise<void> {
    const calendarEl = await page.$("#calendar");
    await calendarEl?.screenshot({ path: filename });
    await page.waitForTimeout(500);

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
      (x) => x.bg !== "rgb(255, 255, 255)"
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
      // imagesSent = false;
      // foundFreeDate = false;
      this.logger.log("No dates free on calendar page");
      return;
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
      await page.screenshot({ path: "unknown_color.png" });
      await this.telegrafService.sendImageMe("unknown_color.png");
    }

    // Filter for only green dates
    backgroundStyles = backgroundStyles.filter(
      (x) => x.bg === "rgb(188, 237, 145)"
    );
    if (backgroundStyles.length === 0) {
      // imagesSent = false;
      // foundFreeDate = false;
      return;
    }
    const msg =
      "Found available dates: " + backgroundStyles.map((x) => x.date).join(",");
    this.logger.log(msg);

    if (!this.foundFreeDate) {
      this.telegrafService.sendChat(msg);
      this.foundFreeDate = true;
    }
    if (!this.imagesSent) {
      await this.telegrafService.sendImageChat("calendar1.png");
      await this.telegrafService.sendImageChat("calendar2.png");
      this.imagesSent = true;
    }
  }

  async FillApplicantForm(page: Page, info: ApplicantInfo): Promise<void> {
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

    try {
      await Promise.all([
        page.waitForNavigation(),
        page.click("#submitbuttonId"),
      ]);
    } catch (error) {
      this.logger.error(
        "Error submitting applicant info: " + JSON.stringify(error)
      );
    }
    await page.waitForTimeout(200);
  }

  /**
   * Can only have one browser open at a time with this call.
   * @returns puppeteer browser and page
   */
  async getBrowser(
    datadir: string | undefined = undefined
  ): Promise<[Browser, Page]> {
    const browser = await puppeteer.launch({
      // @ts-ignore because types are wrong
      headless: options.puppeteer.headless,

      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      ignoreHTTPSErrors: true,
      executablePath: options.puppeteer.executablePath,
      userDataDir: datadir,
    });
    const page = await browser.newPage();
    // Adjustments particular to this page to ensure we hit desktop breakpoint.
    await page.setViewport({ width: 1000, height: 600, deviceScaleFactor: 1 });

    return [browser, page];
  }
}

interface AccountInfo {
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
  Passpord = "1173", //"Passport/ID card",
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

const ErrSessionExpired: RetError = "Invalid url. Need login again";
