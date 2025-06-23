import axios from "axios";
import Repository from "./repository";
import { Strategy } from "./strategies";
import { Instance, InstanceInfo } from "./types";

class Balancer {
  servers: InstanceInfo[] = [];
  constructor(private strategy: Strategy, private repo: Repository) {
    strategy.load();
  }
  getServer = async () => {
    const servers: Instance[] = await this.repo.getInstances();
    console.log("Servers detected: ", servers.length);
    const healthInfoPromises = servers.map(async (server) => {
      const startTime = Date.now();
      const healthInfo = await this.getHealthInfo(server);
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      this.servers.push({
        instance: server,
        healthInfo,
        responseTime,
      });
    });
    await Promise.all(healthInfoPromises);
    const selectedServer = this.strategy.select(this.servers);
    return selectedServer;
  };
  private getHealthInfo = async (server: Instance) => {
    const url = new URL(server.assigned_url);
    const response = await axios.get(`${url.origin}/health`);
    return response.data;
  };
}

export default Balancer;
