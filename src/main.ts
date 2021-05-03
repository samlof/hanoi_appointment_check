import dotenv from "dotenv";
dotenv.config();

import faker from "faker";
import passwordGen from "secure-random-password";
import { Country } from "./countries";
import { myContainer } from "./inversify.config";
import { ApplicantInfo, Gender, PuppetService } from "./puppet/puppetService";
import { TelegrafService } from "./telegram/telegrafService";

const version = require("./package.json").version;

// Add more listeners. Puppeteer uses a lot and might be slow at closing
process.setMaxListeners(20);

async function main() {
  const telegrafService = myContainer.get(TelegrafService);

  const msg = "Running main v" + version;
  console.log(msg);

  try {
    await checkSeatsCalendar();
  } catch (error) {
    const msg = `Error while checking seats: ${JSON.stringify(error)} at ${
      error.stack
    }`;
    telegrafService.sendMe(msg);
    console.error(msg);
  }
}
async function checkSeatsCalendar() {
  const telegrafService = myContainer.get(TelegrafService);
  const puppet = myContainer.get(PuppetService);

  console.log("Running checkSeatsCalendar");
  let fakePerson = makeFakePerson();
  // Use as since we will always make this into correct in loop
  let seatInfo: ApplicantInfo = {} as ApplicantInfo;
  let remakeInfo = true;
  while (true) {
    if (remakeInfo) {
      console.log("Making new account for logging it");
      fakePerson = makeFakePerson();
      seatInfo = {
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
      const error = await puppet.makeNewAccount(fakePerson);
      if (error) {
        console.error("Error making new account: " + error);
        continue;
      }
      remakeInfo = false;
    }
    try {
      console.log("Starting check seats loop");
      const error = await puppet.ReserveSeat(
        fakePerson.Email,
        fakePerson.Password,
        seatInfo
      );
      if (error) {
        if (!error.includes("Need login again")) {
          console.error("Error reserving setas: " + error);
        }
        remakeInfo = true;
      }
    } catch (error) {
      remakeInfo = true;
      telegrafService.sendMe(
        "Got exception from reserve seat: " +
          JSON.stringify(error) +
          " at " +
          error.stack
      );
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

async function makeAccount(
  consoleLog = false
): Promise<[string, string] | undefined> {
  const puppet = myContainer.get(PuppetService);
  const fakePerson = makeFakePerson();
  const email = fakePerson.Email;
  const password = fakePerson.Password;
  const error = await puppet.makeNewAccount(fakePerson);
  if (error) {
    console.error(error);
    return;
  }
  if (consoleLog) {
    console.log(email);
    console.log(password);
  }
  return [email, password];
}

async function reserveTesting() {
  const puppet = myContainer.get(PuppetService);
  // "Gardner12@gmail.com","UW%s4cjLVeP",
  // "steve@protonmail.com", "rY#Ks#$r95H6dyn",
  // "Faustino_Mann@yahoo.com", "wjPe$g7?Xax",
  // await makeAccount(true);
  //telegrafService.sendImageChat("calendar1.png");

  puppet.ReserveSeat("steve@protonmail.com", "rY#Ks#$r95H6dyn", {
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
  });
}

if (!process.env.TEST_ENV) {
  console.log("Starting in server mode. Running main");
  main();
} else {
  console.log("Starting in test mode");

  reserveTesting();
}
