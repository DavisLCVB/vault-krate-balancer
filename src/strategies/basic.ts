import { InstanceInfo } from "@/types";
import { Strategy } from ".";

export class BasicStrategy implements Strategy {
  name = "basic";
  params: string[] = [];
  select = (instances: InstanceInfo[]) => {
    return instances[0];
  };
  load = () => {};
  save = () => {};
}
