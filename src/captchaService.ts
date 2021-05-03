import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

import * as utils from "./utils";
import { TelegrafService } from "./telegram/telegrafService";
import { injectable } from "inversify";

const inUrl = "https://2captcha.com/in.php";
const getUrl = "https://2captcha.com/res.php";
const apiKey = process.env.TWOCAPTCHA_APIKEY;
if (!apiKey) {
  throw Error("2captcha apikey missing. Add TWOCAPTCHA_APIKEY env variable");
}

export const captchaFolder = "captchas/";
const badCaptchaFolder = "badcaptchas/";

try {
  fs.mkdirSync(captchaFolder);
} catch (error) {
  if (error.code !== "EEXIST")
    console.error(`Error making dir ${captchaFolder}: ${error}`);
}
try {
  fs.mkdirSync(badCaptchaFolder);
} catch (error) {
  if (error.code !== "EEXIST")
    console.error(`Error making dir ${badCaptchaFolder}: ${error}`);
}

@injectable()
export class CaptchaService {
  constructor(private telegrafService: TelegrafService) {}

  public reportBad(captchaId: string, filename: string): Promise<unknown> {
    try {
      fs.rename(
        filename,
        filename.replace(captchaFolder, badCaptchaFolder),
        () => {
          // Ignore error
        }
      );
      const txtfile = filename.replace(".png", ".txt");
      fs.rename(
        txtfile,
        txtfile.replace(captchaFolder, badCaptchaFolder),
        () => {
          // Ignore error
        }
      );
    } catch (error) {
      console.error("Failed to save badcaptcha: " + JSON.stringify(error));
    }
    return fetch(`${getUrl}?key=${apiKey}&action=reportbad&id=${captchaId}`, {
      method: "GET",
    });
  }
  public reportGood(captchaId: string): Promise<unknown> {
    return fetch(`${getUrl}?key=${apiKey}&action=reportgood&id=${captchaId}`, {
      method: "GET",
    });
  }

  public async solveCaptcha(filename: string): Promise<Captcha | undefined> {
    try {
      const formData = new FormData();
      formData.append("file", fs.createReadStream(filename));
      formData.append("method", "post");
      formData.append("key", apiKey);
      formData.append("numeric", 2);
      formData.append("min_len", 5);
      formData.append("max_len", 5);
      formData.append("language", 2);

      const sendRet = await fetch(inUrl, {
        method: "POST",
        body: formData,
      });
      let text = await sendRet.text();
      if (text === "ERROR_NO_SLOT_AVAILABLE") {
        await utils.sleep(5000);
      }
      if (!text.startsWith("OK|")) {
        console.log("error sending captcha: " + text);
        this.telegrafService.sendMe("error sending captcha: " + text);
        return;
      }

      const captchaId = text.slice(3);
      await utils.sleep(15 * 1000);
      while (true) {
        console.log("Captcha Waiting 5 seconds");
        await utils.sleep(5 * 1000);
        const ret = await fetch(
          `${getUrl}?key=${apiKey}&action=get&id=${captchaId}`,
          {
            method: "GET",
          }
        );
        text = await ret.text();
        if (typeof text != "string") {
          console.log("Invalid type text: " + text);
          this.telegrafService.sendMe("Invalid type text: " + text);
          return;
        }
        if (text === "CAPCHA_NOT_READY") continue;

        if (!text.startsWith("OK|")) {
          console.log("Error happened: " + text);
          this.telegrafService.sendMe("Error happened: " + text);
          return;
        }
        text = text.slice(3).toUpperCase();

        fs.writeFile(filename.replace(".png", ".txt"), text, () => {
          // Ignore error
        });
        return { answer: text, captchaId: captchaId };
      }
    } catch (error) {
      console.exception("Getting captcha failed: " + JSON.stringify(error));
      this.telegrafService.sendMe(
        "Getting captcha failed: " + JSON.stringify(error)
      );
    }
    return;
  }
}

export interface Captcha {
  answer: string;
  captchaId: string;
}
