import "reflect-metadata";
import { Container } from "inversify";

const myContainer = new Container({
  defaultScope: "Singleton",
  autoBindInjectable: true,
});

export { myContainer };
