import { injectable } from "inversify";

@injectable()
export class Logger {
  public log(msg: string): void {
    console.log(msg);
  }
  public error(msg: string): void {
    console.error(msg);
  }
  public info(msg: string): void {
    console.info(msg);
  }
  public debug(msg: string): void {
    console.debug(msg);
  }
}
