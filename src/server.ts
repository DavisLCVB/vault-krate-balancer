import express from "express";
import cors from "cors";
import Repository from "./repository";
import { SpaceStrategy } from "./strategies";
import Balancer from "./balancer";
import Proxy from "./proxy";

const app = express();
const PORT = parseInt(process.env.PORT || '8000', 10);

/* app.use(express.json({ limit: '100MB' }));
app.use(express.urlencoded({ limit: '100MB', extended: true }));
 */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: "*",
  maxAge: 3600
}));

// Health status endpoint
app.get('/health-status', async (_req, res) => {
  try {
    const repo = new Repository();
    const strategy = new SpaceStrategy();
    const balancer = new Balancer(strategy, repo);
    
    console.log('Checking health status of all servers...');
    
    const allServers = await repo.getInstances();
    
    const healthPromises = allServers.map(async (server) => {
      const startTime = Date.now();
      try {
        const healthInfo = await balancer.checkHealthInfo(server);
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        return {
          instance: server,
          healthInfo,
          responseTime,
          status: 'healthy'
        };
      } catch (error) {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        // Enhanced error logging with server details
        console.error(`Health check failed for server ${server.instance_identifier}:`, {
          server_id: server.id,
          server_identifier: server.instance_identifier,
          server_url: server.assigned_url,
          provider: server.provider,
          error: error instanceof Error ? error.message : 'Unknown error',
          response_time: responseTime,
          timestamp: new Date().toISOString()
        });
        
        // Extract enhanced error details if available
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const serverInfo = (error as any)?.serverInfo;
        
        return {
          instance: server,
          healthInfo: null,
          responseTime,
          status: 'unhealthy',
          error: errorMessage,
          errorDetails: {
            server_identifier: server.instance_identifier,
            server_url: server.assigned_url,
            provider: server.provider,
            failed_at: new Date().toISOString(),
            ...(serverInfo && { enhanced_info: serverInfo })
          }
        };
      }
    });
    
    const serverStatuses = await Promise.all(healthPromises);
    
    const healthyCount = serverStatuses.filter(s => s.status === 'healthy').length;
    const unhealthyCount = serverStatuses.filter(s => s.status === 'unhealthy').length;
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total_servers: serverStatuses.length,
        healthy_servers: healthyCount,
        unhealthy_servers: unhealthyCount,
        overall_status: unhealthyCount === 0 ? 'all_healthy' : 
                       healthyCount === 0 ? 'all_unhealthy' : 'partial_healthy'
      },
      servers: serverStatuses
    });
    
  } catch (error) {
    console.error('Error checking health status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check server health status',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

app.use((req, res, next) => {
  let strategy = new SpaceStrategy();
  let repo = new Repository();
  let balancer = new Balancer(strategy, repo);
  let proxy = new Proxy(balancer, repo);
  proxy.handle(req, res, next);
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vault-Krate Balancer running on port ${PORT}`);
  });
}

module.exports = app;
