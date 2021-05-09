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

const version = require("./package.json").version;

async function main() {
  const logger = container.get(Logger);
  const telegrafService = container.get(TelegrafService);

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

  logger.log("Running checkSeatsCalendar");
  // Use as since we will always make this into correct in loop

  while (true) {
    const [browser, page] = await puppet.getBrowser();
    try {
      // Make new account
      logger.log("Making new account for logging it");
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

      const checkSeatsFunc = async (
        seatCategory: SeatCategory,
        categoryName: string
      ) => {
        // Check rp familty
        await puppet.GotoCalendarPage(page, seatInfo, seatCategory);
        const avDates = await puppet.checkCalendarDays(page);
        logger.log(
          `Found ${avDates.length} available dates for ${categoryName} category`
        );
        if (avDates?.length > 0) {
          telegrafService.sendBroadcast(
            `${categoryName} found seats: ${avDates.join(
              ","
            )}. Go to ${loginPageUrl} to try to reserve a seat`
          );
        }
      };

      while (true) {
        await checkSeatsFunc(SeatCategory.RPFamily, "Family");
        await checkSeatsFunc(SeatCategory.RPStudent, "Student");
        await checkSeatsFunc(SeatCategory.RPWork, "Work");

        await utils.sleep(30 * 1000);
      }
    } catch (error) {
      const errMsg = `Got exception while checking seats: ${JSON.stringify(
        error
      )} at ${error.stack}`;
      logger.error(errMsg);
    } finally {
      browser.close();
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
async function makeAccount(
  consoleLog = false
): Promise<[string, string] | undefined> {
  const puppet = container.get(PuppetService);
  const fakePerson = makeFakePerson();
  const email = fakePerson.Email;
  const password = fakePerson.Password;

  const [, page] = await puppet.getBrowser();
  await puppet.makeNewAccount(page, fakePerson);

  if (consoleLog) {
    console.log(email);
    console.log(password);
  }
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
  console.log("Starting in server mode. Running main");
  main();
} else {
  console.log("Starting in test mode");

  reserveTesting();
}
