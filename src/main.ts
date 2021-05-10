import dotenv from "dotenv";
dotenv.config();
import faker from "faker";
import passwordGen from "secure-random-password";
import { Country } from "./countries";
import { container } from "./inversify.config";
import { Logger } from "./logger";
import {
  ApplicantInfo,
  Gender,
  loginPageUrl,
  PuppetService,
  SeatCategory,
} from "./puppet/puppetService";
import { TelegrafService } from "./telegram/telegrafService";
import { utils } from "./utils";

import { version } from "../package.json";

async function main() {
  const logger = container.get(Logger);

  logger.log("Running main v" + version);

  try {
    await checkSeatsCalendar();
  } catch (error) {
    const msg = `Error while checking seats: ${JSON.stringify(error)} at ${
      error.stack
    }`;
    logger.error(msg);
  }
}
async function checkSeatsCalendar() {
  const logger = container.get(Logger);
  const telegrafService = container.get(TelegrafService);
  const puppet = container.get(PuppetService);
  const foundFreeDate: { [key: string]: boolean } = {};

  logger.log("Running checkSeatsCalendar");

  while (true) {
    const [browser, page] = await puppet.getBrowser();
    try {
      // Make new account
      logger.log("Making new account for logging in");
      const fakePerson = makeFakePerson();
      const seatInfo = {
        Email: fakePerson.Email,
        ContactNumber: faker.phone.phoneNumber("#########"),
        PassportExpirt: "11/04/2025",
        LastName: fakePerson.LastName,
        FirstName: fakePerson.FirstName,
        DateOfBirth: "05/01/1992",
        PassportNumber: "1798215",
        DialCode: "+84",
        Gender: Gender.Male,
        Nationality: Country.VIETNAM,
      };
      await puppet.makeNewAccount(page, fakePerson);

      // Log in
      await puppet.Login(page, fakePerson.Email, fakePerson.Password);

      // Reusable function to check different categories
      const checkSeatsFunc = async (
        seatCategory: SeatCategory,
        categoryName: string
      ) => {
        // Go to final calendar page
        await puppet.GotoCalendarPage(page, seatInfo, seatCategory);
        const avDates = await puppet.CheckCalendarDays(page);
        logger.log(
          `Found ${avDates?.dates.length} available dates for ${categoryName} category`
        );
        if (avDates?.dates.length > 0) {
          if (foundFreeDate[categoryName]) return;
          foundFreeDate[categoryName] = true;

          // Found dates. Send to chat and broadcast
          const msg = `${categoryName} found seats: ${avDates.dates.join(
            ","
          )}. Go to ${loginPageUrl} to try to reserve a seat`;
          await telegrafService.sendChat(msg);
          await telegrafService.sendBroadcast(msg);

          for (const image of avDates.images) {
            if (image) await telegrafService.sendImageChat(image);
          }
        } else {
          if (!foundFreeDate[categoryName]) return;
          foundFreeDate[categoryName] = false;

          // No seats available. Send a message telling that
          const msg = `${categoryName} seats stopped being available`;
          telegrafService.sendChat(msg);
          await telegrafService.sendBroadcast(msg);
        }
      };

      // Run infinite loop checking seats until an exception is thrown
      let timeoutErrors = 0;
      while (true) {
        try {
          await checkSeatsFunc(SeatCategory.RPFamily, "FAMILY");
          await checkSeatsFunc(SeatCategory.RPStudent, "STUDENT");
          await checkSeatsFunc(SeatCategory.RPWork, "WORK");
        } catch (error) {
          // Check for timeout error. In that case retry the loop
          const errorJson = JSON.stringify(error);
          let stack: string = "";
          if (error.stack && typeof error.stack === "string")
            stack = error.stack;
          if (
            timeoutErrors < 5 &&
            (errorJson.includes("TimeoutError") ||
              stack.includes("TimeoutError"))
          ) {
            logger.log("Got timeout error. Retrying loop");
            timeoutErrors++;
          } else throw error;
        }

        await utils.sleep(30 * 1000);
      }
    } catch (error) {
      if (typeof error === "string") {
        logger.error(`Checking seats got string error ${error}`);
        continue;
      } else if (!(error instanceof Error)) {
        logger.error(
          `Checking seats got an error that's not Error but ${typeof error}. JSON: ${JSON.stringify(
            error
          )}`
        );
        continue;
      }
      let stack: string = "";
      if (error.stack && typeof error.stack === "string") stack = error.stack;
      const searchString = error.message + stack;
      if (searchString.includes("Invalid url for checking calendar days")) {
        // Invalid url. Maybe session ran out
        logger.log(
          `Got url ${page.url()} when expected final calendar. Making new browser and account`
        );
      } else if (searchString.includes("TimeoutError")) {
        // Timeout error. Means we retried a few times already but still something wrong. Can try with new browser
        logger.log(`Got timeou error: ${error.message} at ${error.stack}`);
        const sc = await page.screenshot();
        if (sc) telegrafService.sendImageLog(sc);
      } else if (searchString.includes("cannot get to home page")) {
        // Probably logged out. Just put a log instead of error
        logger.log(
          `Got "cannot get to home page". Current page is ${page.url()}. Logging in again`
        );
      } else {
        // Unknown error
        const errMsg = `Got exception while checking seats: ${error.message} at ${error.stack}`;
        logger.error(errMsg);
        const sc = await page.screenshot();
        if (sc) telegrafService.sendImageMe(sc);
      }
    } finally {
      page.removeAllListeners();
      browser.removeAllListeners();
      await page.close();
      await browser.close();
    }
  }
}

function makeFakePerson() {
  const fname = faker.name.firstName();
  const lname = faker.name.lastName();
  const email = faker.internet.email(fname, lname);
  const password = passwordGen.randomPassword({
    length: 11,
    characters: [
      "$@#$!%*?&",
      passwordGen.upper,
      passwordGen.lower,
      passwordGen.digits,
    ],
  });
  const number = faker.phone.phoneNumber("##########");
  return {
    FirstName: fname,
    LastName: lname,
    Email: email,
    PhoneNumber: number,
    Password: password,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function makeAccount(): Promise<[string, string] | undefined> {
  const puppet = container.get(PuppetService);
  const fakePerson = makeFakePerson();
  const email = fakePerson.Email;
  const password = fakePerson.Password;

  const [, page] = await puppet.getBrowser();
  await puppet.makeNewAccount(page, fakePerson);

  const logger = container.get(Logger);
  logger.log(email);
  logger.log(password);

  return [email, password];
}

async function reserveTesting() {
  const puppet = container.get(PuppetService);
  // "Gardner12@gmail.com","UW%s4cjLVeP",
  // "steve@protonmail.com", "rY#Ks#$r95H6dyn",
  // "Faustino_Mann@yahoo.com", "wjPe$g7?Xax",
  // await makeAccount(true);
  //telegrafService.sendImageChat("calendar1.png");

  const [, page] = await puppet.getBrowser();

  const info: ApplicantInfo = {
    Email: "Gardner12@gmail.com",
    ContactNumber: "123125123",
    PassportExpirt: "05/02/2022",
    LastName: "Ner",
    FirstName: "Gardner",
    DateOfBirth: "05/01/1992",
    PassportNumber: "1798215",
    DialCode: "+84",
    Gender: Gender.Male,
    Nationality: Country.VIETNAM,
  };
  await puppet.Login(page, "steve@protonmail.com", "rY#Ks#$r95H6dyn");
  await puppet.GotoCalendarPage(page, info, SeatCategory.RPStudent);
}

if (!process.env.TEST_ENV) {
  // eslint-disable-next-line no-console
  console.log(utils.getTimestamp() + "Starting in server mode. Running main");
  main();
} else {
  // eslint-disable-next-line no-console
  console.log(utils.getTimestamp() + "Starting in test mode");

  reserveTesting();
}
