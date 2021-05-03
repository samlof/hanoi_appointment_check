import * as fs from "fs";
import fetch from "node-fetch";
import { makeFakePerson } from "./fakerUtils";
import { myContainer } from "./inversify.config";
import { PuppetService } from "./puppet/puppetService";
import { TelegrafService } from "./telegram/telegrafService";
import * as utils from "./utils";

const cookieFile = "cookies.txt";

async function checkSeatsFirstPage(): Promise<void> {
  const puppet = myContainer.get(PuppetService);

  console.log("Running checkSeatsFirstPage");
  let cookies = "";
  try {
    const cookieBuffer = fs.readFileSync(cookieFile, "utf8");
    cookies = cookieBuffer.toString();
  } catch (error) {
    // Can ignore error
  }
  let email = "";
  let password = "";
  while (true) {
    if (!cookies) {
      cookies = "";
      console.log("Making new account");
      const fakePerson = makeFakePerson();
      email = fakePerson.Email;
      password = fakePerson.Password;
      try {
        const error = await puppet.makeNewAccount(fakePerson);
        if (error) {
          console.error("Error making new account: " + error);
          continue;
        }
      } catch (error) {
        console.error("Error making new account: " + JSON.stringify(error));
        continue;
      }
      await utils.sleep(500);

      console.log("Getting page cookies");
      cookies = await puppet.getPageCookies(email, password);
      fs.writeFile(cookieFile, cookies, () =>
        console.log("Wrote new cookies to file")
      );
    }
    await utils.sleep(500);

    if (cookies) {
      console.log(`Checking seats`);
      const ret = await checkSeats(cookies);

      if (ret == "invalid cookie") {
        cookies = "";
        await utils.sleep(3 * 1000);
        continue;
      } else if (ret) console.error(ret);

      await utils.sleep(20 * 1000);
    }
  }
}

let seatsAvailableState = false;
async function checkSeats(cookies: string): Promise<string> {
  const telegrafService = myContainer.get(TelegrafService);
  try {
    const ret = await fetch(
      "https://online.vfsglobal.com/FinlandAppt/Account/CheckSeatAllotment",
      {
        headers: {
          accept: "application/json, text/javascript, */*; q=0.01",
          "accept-language": "en-US,en;q=0.9",
          "cache-control": "no-cache",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          pragma: "no-cache",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "x-requested-with": "XMLHttpRequest",
          cookie: cookies,
        },
        body:
          "countryId=29&missionId=1&LocationId=33&Location=Embassy+of+Finland+-+Hanoi",
        method: "POST",
      }
    );

    const text = await ret.text();
    if (typeof text != "string") {
      return "Got invalid return value: " + text;
    }
    if (text.length > 500) {
      console.log("Invalid cookie");
      return "invalid cookie";
    }
    // No seats are available. Reset state and send message if state was true
    if (text.includes("There are no open seats available")) {
      console.log("No seats available");
      if (seatsAvailableState) {
        const msg = "Seats stopped being available";
        telegrafService.sendChat(msg);
        telegrafService.sendBroadcast(msg);
      }
      seatsAvailableState = false;
    } else if (text == '""') {
      console.log("There are free seats!");
      // Seats are available if empty response. Send broadcast and to group
      if (!seatsAvailableState) {
        const msg =
          "Seats are available. Visit https://online.vfsglobal.com/FinlandAppt/Account/RegisteredLogin?q=shSA0YnE4pLF9Xzwon/x/FXkgptUe6eKckueax3hilyMCJeF9rpsVy6pNcXQaW1lGwqZ09Q3CAT0LslshZBx5g== to try to reserve a place";

        telegrafService.sendChat(msg);
        telegrafService.sendBroadcast(msg);
      }
      seatsAvailableState = true;
    } else {
      telegrafService.sendMe("Unknown return for cheking seats: " + text);
      console.log("Unknown return: " + text);
    }
  } catch (error) {
    return JSON.stringify(error);
  }
  return "";
}
