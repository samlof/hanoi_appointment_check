export const bot_token = process.env.TELEGRAM_BOT_TOKEN as string;
if (!bot_token) {
  throw Error(
    "Telegram bot token missing. Add TELEGRAM_BOT_TOKEN env variable"
  );
}
