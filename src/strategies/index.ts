import { InstanceInfo } from "@/types";
import { BasicStrategy } from "./basic";
import { SpaceStrategy } from "./space";

interface Strategy {
  name: string;
  select: (instances: InstanceInfo[]) => InstanceInfo;
  load: () => void;
  save: () => void;
}

export { BasicStrategy, Strategy, SpaceStrategy };
