import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

import { utils } from "../../utils";
import { injectable } from "inversify";
import { Logger } from "../../logger";

const inUrl = "https://2captcha.com/in.php";
const getUrl = "https://2captcha.com/res.php";
const apiKey = process.env.TWOCAPTCHA_APIKEY;
if (!apiKey) {
  throw Error(
    utils.getTimestamp() +
      " 2captcha apikey missing. Add TWOCAPTCHA_APIKEY env variable"
  );
}

export const captchaFolder = "captchas/";
const badCaptchaFolder = "badcaptchas/";

try {
  fs.mkdirSync(captchaFolder);
} catch (error) {
  if (error.code !== "EEXIST")
    // eslint-disable-next-line no-console
    console.error(`Error making dir ${captchaFolder}: ${error}`);
}
try {
  fs.mkdirSync(badCaptchaFolder);
} catch (error) {
  if (error.code !== "EEXIST")
    // eslint-disable-next-line no-console
    console.error(`Error making dir ${badCaptchaFolder}: ${error}`);
}

@injectable()
export class TwoCaptchaService {
  constructor(private logger: Logger) {
    this.logger.init("CaptchaService");
  }

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
      this.logger.error("Failed to save badcaptcha: " + JSON.stringify(error));
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

      // Run loop to retry if sending captcha failed
      let text = "";
      for (let i = 0; i < 5; i++) {
        const sendRet = await fetch(inUrl, {
          method: "POST",
          body: formData,
        });
        text = await sendRet.text();
        if (text === "ERROR_NO_SLOT_AVAILABLE") {
          await utils.sleep(1000);
        } else if (!text.startsWith("OK|")) {
          this.logger.error("error sending captcha: " + text);
          return;
        } else break;
      }
      if (!text.startsWith("OK|")) {
        this.logger.error("error sending captcha: " + text);
        return;
      }

      const captchaId = text.slice(3);
      await utils.sleep(15 * 1000);
      while (true) {
        this.logger.log("Captcha Waiting 5 seconds");
        await utils.sleep(5 * 1000);
        const ret = await fetch(
          `${getUrl}?key=${apiKey}&action=get&id=${captchaId}`,
          {
            method: "GET",
          }
        );
        text = await ret.text();
        if (typeof text != "string") {
          this.logger.error(
            "Invalid type return: " + text + " . Type of " + typeof text
          );
          return;
        }
        if (text === "CAPCHA_NOT_READY") continue;

        if (!text.startsWith("OK|")) {
          this.logger.error("Error with receiving captcha: " + text);
          return;
        }
        text = text.slice(3).toUpperCase();

        fs.writeFile(filename.replace(".png", ".txt"), text, () => {
          // Ignore error
        });
        return { answer: text, captchaId: captchaId };
      }
    } catch (error) {
      this.logger.error("Getting captcha failed: " + JSON.stringify(error));
    }
  }
}

export interface Captcha {
  answer: string;
  captchaId: string;
}
