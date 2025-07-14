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
    try {
      const url = new URL(server.assigned_url);
      const response = await axios.get(`${url.origin}/health`, {
        timeout: 10000, // 10 seconds timeout
        headers: {
          'User-Agent': 'Vault-Krate-Balancer/1.0'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Health check failed for server ${server.instance_identifier} (${server.assigned_url}):`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        server_id: server.id,
        server_url: server.assigned_url,
        timestamp: new Date().toISOString()
      });
      
      // Re-throw with enhanced error information
      const enhancedError = new Error(
        `Server ${server.instance_identifier} health check failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      (enhancedError as any).serverInfo = {
        id: server.id,
        identifier: server.instance_identifier,
        url: server.assigned_url,
        provider: server.provider
      };
      throw enhancedError;
    }
  };
  
  public checkHealthInfo = async (server: Instance) => {
    return this.getHealthInfo(server);
  };
}

export default Balancer;
