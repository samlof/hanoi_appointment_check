import { injectable } from "inversify";
import { Telegraf } from "telegraf";
import { utils } from "../utils";
import { bot_token } from "./bot_token";
import { BroadcastFileService } from "./broadcastFileService";

const telegramOff = !!process.env.TELEGRAM_OFF;
// eslint-disable-next-line no-console
console.log(
  utils.getTimestamp() + "Telegram bot is " + (telegramOff ? "OFF" : "ON")
);

const chat_id = "-1001438199502";
const samuli_telegram_id = "72781909";
const log_chat_id = "-1001408943087";

@injectable()
export class TelegrafService {
  constructor(private broadcastFileService: BroadcastFileService) {
    this.bot = new Telegraf(bot_token);
  }
  private bot: Telegraf;

  public sendMe(msg: string): void {
    this.bot.telegram.sendMessage(samuli_telegram_id, msg);
  }
  public sendChat(msg: string): void {
    if (telegramOff) return;

    this.bot.telegram.sendMessage(chat_id, msg);
  }

  public async sendImageMeFileName(photoFile: string): Promise<void> {
    await this.bot.telegram.sendPhoto(samuli_telegram_id, {
      source: photoFile,
    });
  }
  public async sendImageMe(buffer: string | Buffer): Promise<void> {
    if (typeof buffer === "string") {
      await this.bot.telegram.sendPhoto(samuli_telegram_id, {
        source: buffer,
      });
      return;
    }
    await this.bot.telegram.sendPhoto(samuli_telegram_id, {
      source: buffer,
    });
  }
  public async sendImageLog(buffer: string | Buffer): Promise<void> {
    if (typeof buffer === "string") {
      await this.bot.telegram.sendPhoto(log_chat_id, {
        source: buffer,
      });
      return;
    }
    await this.bot.telegram.sendPhoto(log_chat_id, {
      source: buffer,
    });
  }

  public async sendImageChat(photoFile: string): Promise<void> {
    if (telegramOff) return;

    await this.bot.telegram.sendPhoto(chat_id, {
      source: photoFile,
    });
  }

  public async sendBroadcast(msg: string): Promise<void> {
    if (telegramOff) return;
    for (const id of this.broadcastFileService.readIds()) {
      try {
        await this.bot.telegram.sendMessage(id, msg);
      } catch (error) {
        if (!(error instanceof Error)) {
          this.sendMe(
            `Sending broadcast msg ${msg} to id ${id} got error not Error: ${JSON.stringify(
              error
            )}`
          );
          continue;
        }

        const searchStr = error.message + error.stack;
        // Remove from list if was blocked
        if (searchStr.includes("bot was blocked by the user"))
          this.broadcastFileService.removeId(id);
        else {
          `Sending broadcast msg ${msg} to id ${id} got error not Error: ${error.message} at: ${error.stack}`;
        }
      }
    }
  }

  public async sendImageBroadcast(photoFile: string): Promise<void> {
    if (telegramOff) return;

    const img = await this.bot.telegram.sendPhoto(chat_id, {
      source: photoFile,
    });

    const fileId = img.photo[0].file_id;

    for (const id of this.broadcastFileService.readIds()) {
      await this.bot.telegram.sendPhoto(id, fileId);
    }
  }

  public async sendLogMessage(msg: string): Promise<void> {
    if (telegramOff) return;
    await this.bot.telegram.sendMessage(log_chat_id, msg);
  }
}
