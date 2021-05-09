import dotenv from "dotenv";
dotenv.config();
import { container } from "./inversify.config";
import { BroadcastServer } from "./telegram/broadcastServer";

container.get(BroadcastServer);
