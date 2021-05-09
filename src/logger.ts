/* eslint-disable no-console */

import { injectable } from "inversify";
import { TelegrafService } from "./telegram/telegrafService";
import { utils } from "./utils";

@injectable()
export class Logger {
  constructor(private telegrafService: TelegrafService) {}

  public init(serviceName: string): void {
    this.serviceName = serviceName;
  }

  private serviceName = "";

  public log(msg: string): void {
    msg = "LOG: " + msg;
    msg = this.formatMsg(msg);

    console.log(msg);
    this.sendTelegram(msg);
  }
  public error(msg: string): void {
    msg = "ERROR: " + msg;
    msg = this.formatMsg(msg);

    console.error(msg);
    this.sendTelegram(msg);

    // Send error to my telegram as well
    this.telegrafService.sendMe(msg);
  }
  public info(msg: string): void {
    msg = "INFO: " + msg;
    msg = this.formatMsg(msg);

    console.info(msg);
    this.sendTelegram(msg);
  }
  public debug(msg: string): void {
    msg = "DEBUG: " + msg;
    msg = this.formatMsg(msg);

    console.debug(msg);
    this.sendTelegram(msg);
  }

  private formatMsg(msg: string): string {
    if (this.serviceName) {
      msg = `{${this.serviceName}} ` + msg;
    }

    msg = utils.getTimestamp() + msg + " ";
    return msg;
  }

  private async sendTelegram(msg: string) {
    try {
      await this.telegrafService.sendLogMessage(msg);
    } catch (error) {
      console.error(
        utils.getTimestamp() +
          "error sending log to telegram: " +
          JSON.stringify(error, null, 2)
      );
    }
  }
}
