import { injectable } from "inversify";
import {
  RateLimiterMemory,
  RateLimiterQueue,
  RateLimiterUnion,
} from "rate-limiter-flexible";
import { Telegraf } from "telegraf";
import { utils } from "../utils";
import { bot_log_token, bot_token } from "./bot_token";
import { BroadcastFileService } from "./broadcastFileService";

const telegramOff = !!process.env.TELEGRAM_OFF;
// eslint-disable-next-line no-console
console.log(
  utils.getTimestamp() + "Telegram bot is " + (telegramOff ? "OFF" : "ON")
);

const chat_id = "-1001438199502";
const samuli_telegram_id = "72781909";
const log_chat_id = "-1001408943087";
export enum TelegrafType {
  Default,
  Log,
}

// Global rate limit of 30 per second
const rateLimiterOpts = {
  points: 29, // 29 points
  duration: 1, // Per second
};
const rateLimiterMaxQueueSize = {
  maxQueueSize: 100,
};
const logRateLimiterMemory = new RateLimiterMemory({
  ...rateLimiterOpts,
  keyPrefix: "logoveralllimit",
});
const rateLimiters = {
  [TelegrafType.Default]: new RateLimiterQueue(
    new RateLimiterMemory(rateLimiterOpts),
    rateLimiterMaxQueueSize
  ),
  [TelegrafType.Log]: new RateLimiterQueue(
    logRateLimiterMemory,
    rateLimiterMaxQueueSize
  ),
};

const logRateLimiterUnion = new RateLimiterUnion(
  // bot will not be able to send more than 20 messages per minute to the same group
  new RateLimiterMemory({
    duration: 60,
    points: 15,
    keyPrefix: "log20perminute",
  }),
  // bot shouldn't send more than one message per second
  new RateLimiterMemory({
    duration: 2,
    points: 1,
    keyPrefix: "logonepersecond",
  }),
  logRateLimiterMemory
);

@injectable()
export class TelegrafService {
  constructor(private broadcastFileService: BroadcastFileService) {
    this.bot = new Telegraf(bot_token);
    this.type = TelegrafType.Default;
  }

  /**
   * Can be used to change bot that's used to send any messages
   * @param type Bot type
   */
  public changeToken(type: TelegrafType = TelegrafType.Default): void {
    this.type = type;

    if (type === TelegrafType.Default) this.bot = new Telegraf(bot_token);
    else if (type === TelegrafType.Log) this.bot = new Telegraf(bot_log_token);
  }

  private bot: Telegraf;
  private type: TelegrafType;

  public async sendMe(msg: string): Promise<void> {
    await rateLimiters[this.type].removeTokens(1);
    await this.bot.telegram.sendMessage(samuli_telegram_id, msg);
  }

  public async sendChat(msg: string): Promise<void> {
    if (telegramOff) return;
    await rateLimiters[this.type].removeTokens(1);

    await this.bot.telegram.sendMessage(chat_id, msg);
  }

  public async sendImageMeFileName(photoFile: string): Promise<void> {
    await rateLimiters[this.type].removeTokens(1);
    await this.bot.telegram.sendPhoto(samuli_telegram_id, {
      source: photoFile,
    });
  }
  public async sendImageMe(buffer: string | Buffer): Promise<void> {
    await rateLimiters[this.type].removeTokens(1);
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

  public async sendImageChatFile(photoFile: string): Promise<void> {
    if (telegramOff) return;
    await rateLimiters[this.type].removeTokens(1);

    await this.bot.telegram.sendPhoto(chat_id, {
      source: photoFile,
    });
  }

  public async sendImageChat(buffer: string | Buffer): Promise<void> {
    if (telegramOff) return;
    await rateLimiters[this.type].removeTokens(1);

    if (typeof buffer === "string") {
      await this.bot.telegram.sendPhoto(chat_id, {
        source: buffer,
      });
      return;
    }
    await this.bot.telegram.sendPhoto(chat_id, {
      source: buffer,
    });
  }

  public async sendBroadcast(msg: string): Promise<void> {
    if (telegramOff) return;

    for (const id of this.broadcastFileService.readIds()) {
      await rateLimiters[this.type].removeTokens(1);
      try {
        await this.bot.telegram.sendMessage(id, msg);
        // Catch block to check if bot is blocked. Then remove from userIds list
      } catch (error) {
        // Check if error isn't Error type
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
          this.sendMe(
            `Sending broadcast msg ${msg} to id ${id} got error not Error: ${error.message} at: ${error.stack}`
          );
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
      await rateLimiters[this.type].removeTokens(1);
      await this.bot.telegram.sendPhoto(id, fileId);
    }
  }

  public async sendLogMessage(msg: string): Promise<void> {
    if (telegramOff) return;
    await logRateLimiterUnion.consume(1);

    await this.bot.telegram.sendMessage(log_chat_id, msg);
  }

  public async sendImageLog(buffer: string | Buffer): Promise<void> {
    if (telegramOff) return;
    await logRateLimiterUnion.consume(1);

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
}
