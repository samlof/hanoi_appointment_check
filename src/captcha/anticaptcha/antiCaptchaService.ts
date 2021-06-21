import fs from "fs";
import { injectable } from "inversify";
import fetch from "node-fetch";
import { Logger } from "../../logger";
import { utils } from "../../utils";

const inUrl = "https://api.anti-captcha.com/createTask";
const getUrl = "https://api.anti-captcha.com/getTaskResult";
const apiKey = process.env.ANTICAPTCHA_APIKEY;
if (!apiKey) {
  throw Error(
    utils.getTimestamp() +
      " 2captcha apikey missing. Add ANTICAPTCHA_APIKEY env variable"
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
export class AntiCaptchaService {
  constructor(private logger: Logger) {
    this.logger.init("AntiCaptchaService");
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
    return fetch("https://api.anti-captcha.com/reportIncorrectImageCaptcha", {
      method: "POST",
      body: JSON.stringify({
        clientKey: apiKey,
        taskId: captchaId,
      }),
    });
  }

  // Keeping parameter to be same as twoCaptcha
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public reportGood(captchaId: string): Promise<unknown> {
    return Promise.resolve();
  }

  public async solveCaptcha(filename: string): Promise<Captcha | undefined> {
    try {
      // Send captcha loop
      let sendJson: { errorId: number; taskId: string } | null = null;
      const fileBase64 = fs.readFileSync(filename, { encoding: "base64" });
      for (let i = 0; i < 5; i++) {
        const sendRet = await fetch(inUrl, {
          method: "POST",
          body: JSON.stringify({
            clientKey: apiKey,
            task: {
              type: "ImageToTextTask",
              body: fileBase64,
              phrase: false,
              case: false,
              numeric: 2, // Only letters, no numbers
              math: false,
              minLength: 5,
              maxLength: 5,
            },
          }),
          headers: { "Content-Type": "application/json" },
        });
        sendJson = await sendRet.json();
        if (!sendJson) {
          this.logger.error("error sending captcha: empty response text");
          return;
        } else if (sendJson.errorId > 0) {
          this.logger.error(
            "error sending captcha: " + JSON.stringify(sendJson)
          );
          return;
        } else break;
      }
      if (!sendJson || sendJson.errorId > 0) {
        this.logger.error("error sending captcha: " + sendJson);
        return;
      }

      // Get solution loop
      const taskId = sendJson.taskId;
      await utils.sleep(15 * 1000);
      while (true) {
        this.logger.log("Captcha Waiting 5 seconds");
        await utils.sleep(5 * 1000);
        const receiveRes = await fetch(getUrl, {
          method: "POST",
          body: JSON.stringify({
            clientKey: apiKey,
            taskId: taskId,
          }),
          headers: { "Content-Type": "application/json" },
        });
        const text: {
          errorId: number;
          errorCode: string;
          status: "ready" | "processing";
          solution: { text: string };
        } = await receiveRes.json();

        if (text.status === "processing") continue;
        else if (text.status !== "ready") {
          this.logger.error(
            "Error with receiving captcha. Got different status: " +
              JSON.stringify(text)
          );
          return;
        }

        if (text.errorId > 0) {
          this.logger.error(
            "Error with receiving captcha: " + JSON.stringify(text)
          );
          return;
        }

        fs.writeFile(
          filename.replace(".png", ".txt"),
          text.solution.text,
          () => {
            // Ignore error
          }
        );
        return { answer: text.solution.text, captchaId: taskId };
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
