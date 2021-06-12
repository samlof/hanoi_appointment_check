import { utils } from "../utils";

export const bot_token = process.env.TELEGRAM_BOT_TOKEN as string;
if (!bot_token) {
  throw Error(
    utils.getTimestamp() +
      " Telegram bot token missing. Add TELEGRAM_BOT_TOKEN env variable"
  );
}

export const bot_log_token = process.env.TELEGRAM_BOT_LOG_TOKEN as string;
if (!bot_log_token) {
  throw Error(
    utils.getTimestamp() +
      " Telegram bot token missing. Add TELEGRAM_BOT_LOG_TOKEN env variable"
  );
}
