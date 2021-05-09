import { Container } from "inversify";
import "reflect-metadata";

const container = new Container({
  autoBindInjectable: true,
});

export { container };
