import * as fs from "fs";
import { injectable } from "inversify";

const broadcastListFile = "userids.txt";

@injectable()
export class BroadcastFileService {
  /**
   * Get ids that are registered for broadcasting from file
   * @returns List if telegram ids
   */
  public readIds(): string[] {
    let fileContent: string = "";
    try {
      fileContent = fs.readFileSync(broadcastListFile).toString();
    } catch (error) {
      if (error.code != "ENOENT") {
        throw error;
      }
    }

    const ids: string[] = [];
    for (const line of fileContent.split("\n")) {
      if (line && line.trim()) {
        const parts = line.trim().split("||");
        ids.push(parts[0].trim());
      }
    }
    return ids;
  }

  public addId(id: string): void {
    const ids = this.readIds();

    // Already have this id in file. Can skip saving
    if (ids.includes(id)) return;

    ids.push(id);
    this.resave(ids);

    // Try again if failed to add id
    if (!this.readIds().includes(id)) this.addId(id);
  }

  public removeId(id: string): void {
    const ids = this.readIds();

    const i = ids.indexOf(id);
    if (i === -1) return;

    ids.splice(i, 1);
    this.resave(ids);

    // Try again if failed to remove id
    if (this.readIds().includes(id)) this.addId(id);
  }

  private resave(ids: string[]): void {
    try {
      fs.writeFileSync(broadcastListFile, ids.join("\n") + "\n");
    } catch (error) {
      throw new Error(
        `Error saving broadcast file with ids ${ids}. Exception: ${JSON.stringify(
          error
        )}`
      );
    }
  }
}
