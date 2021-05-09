import { injectable } from "inversify";
import { Telegraf } from "telegraf";
import { BroadcastFileService } from "./broadcastFileService";

const telegramOff = !!process.env.TELEGRAM_OFF;
console.log("Telegram bot is " + (telegramOff ? "OFF" : "ON"));

const bot_token = "1493051473:AAFoQbnBS21kcE0iYFymlRfSsgNPLGAOTrU";
const chat_id = "-1001438199502";
const samuli_telegram_id = "72781909";
const log_chat_id = "394309276";

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

  public async sendImageChat(photoFile: string): Promise<void> {
    if (telegramOff) return;

    await this.bot.telegram.sendPhoto(chat_id, {
      source: photoFile,
    });
  }

  public async sendBroadcast(msg: string): Promise<void> {
    if (telegramOff) return;
    for (const id of this.broadcastFileService.readIds()) {
      await this.bot.telegram.sendMessage(id, msg);
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
    await this.bot.telegram.sendMessage(log_chat_id, msg);
  }
}
