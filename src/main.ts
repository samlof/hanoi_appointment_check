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
  require("events").defaultMaxListeners = 20;

  const logger = container.get(Logger);

  logger.log("Running main v" + version);

  try {
    checkSeatsCalendar(SeatCategory.RPFamily, "FAMILY");
    checkSeatsCalendar(SeatCategory.RPStudent, "STUDENT");
    checkSeatsCalendar(SeatCategory.RPWork, "WORK");
    checkSeatsCalendar(SeatCategory.Visa, "SCHENGEN VISA");
  } catch (error) {
    const msg = `Error while checking seats: ${JSON.stringify(error)} at ${
      error.stack
    }`;
    logger.error(msg);
  }
}
async function checkSeatsCalendar(
  seatCategory: SeatCategory,
  categoryName: string
) {
  const logger = container.get(Logger);
  logger.init(`checkSeatsCalendar ${categoryName}`);
  const telegrafService = container.get(TelegrafService);
  const puppet = container.get(PuppetService);
  let foundFreeDate = false;

  logger.log("Running checkSeatsCalendar");

  while (true) {
    const [browser, page] = await puppet.getBrowser();
    try {
      // Make new account
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
      logger.log("Making new account for logging in");
      await puppet.makeNewAccount(page, fakePerson);

      // Log in
      logger.log("Logging in");
      await puppet.Login(page, fakePerson.Email, fakePerson.Password);

      // Go to final calendar page
      logger.log("Going to calendar page");
      await puppet.GotoCalendarPage(page, seatInfo, seatCategory);

      // Infinite loop to check and reload calendar page
      while (true) {
        // Wait 30 seconds between tries
        await utils.sleep(30 * 1000);

        // Reload and check calendar for free dates
        const avDates = await puppet.CheckCalendarDays(page);
        let logMsg = `Found ${avDates?.dates.length} available dates for ${categoryName} category`;
        if (avDates?.dates.length > 0) {
          const avDatesStr = avDates.dates.join(",");
          logMsg += avDatesStr;

          // Check if found free date sent already
          if (foundFreeDate) {
            logger.log(logMsg);
            continue;
          }
          foundFreeDate = true;

          // Found dates. Send to chat and broadcast
          const msg = `${categoryName} found seats: ${avDatesStr}. Go to ${loginPageUrl} to try to reserve a seat`;
          await telegrafService.sendChat(msg);
          await telegrafService.sendBroadcast(msg);

          for (const image of avDates.images) {
            if (image) await telegrafService.sendImageChat(image);
          }
        } else {
          // Check if seat stopped sent already
          if (!foundFreeDate) {
            logger.log(logMsg);
            continue;
          }
          foundFreeDate = false;

          // No seats available. Send a message telling that
          const msg = `${categoryName} seats stopped being available`;
          telegrafService.sendChat(msg);
          await telegrafService.sendBroadcast(msg);
        }
      }
    } catch (error) {
      if (typeof error === "string") {
        logger.error(
          `Checking seats ${categoryName} got string error ${error}. On page ${page.url()}`
        );
        continue;
      } else if (!(error instanceof Error)) {
        logger.error(
          `Checking seats ${categoryName} got an error that's not Error but ${typeof error}. JSON: ${JSON.stringify(
            error
          )}. On page ${page.url()}`
        );
        continue;
      }
      let stack: string = "";
      if (error.stack && typeof error.stack === "string") stack = error.stack;
      const searchString = error.message + stack;

      if (searchString.includes("?ReturnUrl=/")) {
        // Was logged out. Can just continue
        logger.log("Was logged out. Close browser and start again");
      } else if (searchString.includes("Invalid url")) {
        // Invalid url
        logger.log(
          `Invalid url. Got ${categoryName} url ${page.url()} and error ${
            error.message
          } at ${error.stack}`
        );
      } else if (searchString.includes("TimeoutError")) {
        // Timeout error. Don't log as error but just normal log
        logger.log(
          `Got timeout error on page ${page.url()}: ${error.message} at ${
            error.stack
          }`
        );
      } else if (searchString.includes("cannot get to home page")) {
        // Probably logged out. Just put a log instead of error
        logger.log(
          `Got ${categoryName} "cannot get to home page". Current page is ${page.url()}`
        );
      } else {
        // Unknown error
        const errMsg = `Got ${categoryName} exception while checking seats on page ${page.url()}: ${
          error.message
        } at ${error.stack}`;
        logger.error(errMsg);
      }
    } finally {
      logger.log("Removing listeners and closing browser");
      page.removeAllListeners();
      browser.removeAllListeners();
      page.close().then(() => browser.close());
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

// Used when testing
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  //main();
}
