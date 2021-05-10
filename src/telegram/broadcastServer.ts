import { injectable } from "inversify";
import { Telegraf } from "telegraf";
import { utils } from "../utils";
import { bot_token } from "./bot_token";
import { BroadcastFileService } from "./broadcastFileService";

import { version } from "../../package.json";

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(utils.getTimestamp() + msg);
}

@injectable()
export class BroadcastServer {
  constructor(private broadcastFileService: BroadcastFileService) {
    const bot = new Telegraf(bot_token);

    bot.start((ctx) => {
      this.addToBroadcastlist(ctx.from.id);
      log("/add called");
      ctx.reply(
        "You have been added to list. You can stop your subscription with command /quit. I will notify you if I find seats available"
      );
    });
    bot.command("/quit", (ctx) => {
      this.removeFromBroadcastlist(ctx.from.id);
      log("/quit called");
      ctx.reply(
        "You have been removed from list. To rejoin you can send /start"
      );
    });

    log("Starting telegraf bot v" + version);
    bot.launch();

    // Enable graceful stop
    process.once("SIGINT", () => {
      log("SIGINT to telegraf bot");
      bot.stop("SIGINT");
    });
    process.once("SIGTERM", () => {
      log("SIGTERM to telegraf bot");
      bot.stop("SIGTERM");
    });
  }

  private removeFromBroadcastlist(userId: string | number): void {
    if (typeof userId === "number") {
      userId = userId.toString();
    }
    this.broadcastFileService.removeId(userId);
  }

  private addToBroadcastlist(userId: string | number): void {
    if (typeof userId === "number") {
      userId = userId.toString();
    }
    this.broadcastFileService.addId(userId);
  }
}
