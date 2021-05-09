import { injectable } from "inversify";
import { Telegraf } from "telegraf";
import { bot_token } from "./bot_token";
import { BroadcastFileService } from "./broadcastFileService";

const samuli_telegram_id = "72781909";

const bot = new Telegraf(bot_token);

@injectable()
export class BroadcastServer {
  constructor(private broadcastFileService: BroadcastFileService) {
    bot.start((ctx) => {
      this.addToBroadcastlist(ctx.from.id);
      ctx.reply(
        "You have been added to list. You can stop your subscription with command /quit. I will notify you if I find seats available"
      );
    });
    bot.command("/quit", (ctx) => {
      this.removeFromBroadcastlist(ctx.from.id);
      ctx.reply(
        "You have been removed from list. To rejoin you can send /start"
      );
    });
    bot.command("/sendbroadcast", (ctx) => {
      if (ctx.from.id.toString() !== samuli_telegram_id) return;
      //this.sendBroadcast(ctx.message.text.replace("/sendbroadcast", "").trim());
    });

    console.log("Starting telegraf bot");
    bot.launch();

    // Enable graceful stop
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
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
