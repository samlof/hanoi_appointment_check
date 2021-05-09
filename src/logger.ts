import { injectable } from "inversify";
import { TelegrafService } from "./telegram/telegrafService";
import { format } from "date-fns";

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
    this.telegrafService.sendLogMessage(msg);
  }
  public error(msg: string): void {
    msg = "ERROR: " + msg;
    msg = this.formatMsg(msg);

    console.error(msg);
    this.telegrafService.sendLogMessage(msg);

    // Send error to my telegram as well
    this.telegrafService.sendMe(msg);
  }
  public info(msg: string): void {
    msg = "INFO: " + msg;
    msg = this.formatMsg(msg);

    console.info(msg);
    this.telegrafService.sendLogMessage(msg);
  }
  public debug(msg: string): void {
    msg = "DEBUG: " + msg;
    msg = this.formatMsg(msg);

    console.debug(msg);
    this.telegrafService.sendLogMessage(msg);
  }

  private formatMsg(msg: string): string {
    const timestamp = format(new Date(), dateFormat);
    msg = timestamp + msg + " ";
    if (this.serviceName) {
      msg = `{${this.serviceName}} ` + msg;
    }

    return msg;
  }
}

const dateFormat = "[dd.MM.yyyy HH:mm.ss.SSSS] ";
