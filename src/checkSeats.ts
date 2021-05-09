import * as fs from "fs";
import fetch from "node-fetch";
import { makeFakePerson } from "./fakerUtils";
import { container } from "./inversify.config";
import { PuppetService } from "./puppet/puppetService";
import { TelegrafService } from "./telegram/telegrafService";
import { utils } from "./utils";

const cookieFile = "cookies.txt";

// This is not used currently. Isn't accurate
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function checkSeatsFirstPage(): Promise<void> {
  const puppet = container.get(PuppetService);

  console.log("Running checkSeatsFirstPage");
  let cookies = "";
  try {
    const cookieBuffer = fs.readFileSync(cookieFile, "utf8");
    cookies = cookieBuffer.toString();
  } catch (error) {
    // Can ignore error
  }
  while (true) {
    // Make new account
    if (!cookies) {
      cookies = "";
      console.log("Making new account");

      const [browser, page] = await puppet.getBrowser();
      try {
        // Make new account and log in
        const fakePerson = makeFakePerson();
        await puppet.makeNewAccount(page, fakePerson);
        console.log("Getting page cookies");
        cookies = await puppet.Login(
          page,
          fakePerson.Email,
          fakePerson.Password
        );
        fs.writeFile(cookieFile, cookies, () =>
          console.log("Wrote new cookies to file")
        );
      } catch (error) {
        console.error("Error making new account: " + JSON.stringify(error));
        continue;
      } finally {
        browser.close();
      }
      await utils.sleep(500);
    }
    await utils.sleep(500);

    // Check for seats error on category page
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
  const telegrafService = container.get(TelegrafService);
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
