import * as fs from "fs";
import * as fsAsync from "fs/promises";
import { injectable } from "inversify";
import { Logger } from "./logger";

export enum FoundDateStatus {
  NotFound,
  Found,
  PendingNotFound,
}

const getFilename = (cat: string) => `.temp/foundDate_${cat}.txt`;
try {
  fs.mkdirSync(".temp");
} catch (error) {
  const err = error as Error;
  if (!err.message.includes("file already exists")) {
    throw error;
  }
}

@injectable()
export class FoundDateState {
  constructor(private logger: Logger) {
    this.logger.init("FoundDateState");
  }
  public async getState(seatCategory: string): Promise<FoundDateStatus> {
    const filename = getFilename(seatCategory);
    try {
      const res = await fsAsync.readFile(filename);
      return JSON.parse(res.toString());
    } catch (error) {
      this.logger.error(
        `reading file ${filename} had error: ${JSON.stringify(error)}`
      );
    }
    return FoundDateStatus.NotFound;
  }

  public async checkState(
    seatcategory: string,
    status: FoundDateStatus
  ): Promise<boolean> {
    const curr = await this.getState(seatcategory);
    return curr === status;
  }

  public async saveState(
    seatCategory: string,
    status: FoundDateStatus
  ): Promise<void> {
    const filename = getFilename(seatCategory);

    await fsAsync.writeFile(filename, JSON.stringify(status));
  }
}
