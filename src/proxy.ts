import { NextFunction, Request, Response } from "express";
import Balancer from "./balancer";
import { createProxyMiddleware } from "http-proxy-middleware";
import { InstanceInfo } from "./types";
import Repository from "./repository";

interface ProxyConfig {
  timeout: number;
  retries: number;
  retryDelay: number;
  enableLogging: boolean;
}

class Proxy {
  private config: ProxyConfig = {
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
    enableLogging: true,
  };

  private failedInstances = new Set<string>();
  private lastCleanup = Date.now();
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor(private balancer: Balancer, private repository: Repository, config?: Partial<ProxyConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  private cleanupFailedInstances() {
    const now = Date.now();
    if (now - this.lastCleanup > this.CLEANUP_INTERVAL) {
      this.failedInstances.clear();
      this.lastCleanup = now;
      if (this.config.enableLogging) {
        console.log("Cleared failed instances cache");
      }
    }
  }

  private async getServerWithRetry(): Promise<InstanceInfo> {
    this.cleanupFailedInstances();
    
    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      try {
        const server = await this.balancer.getServer();
        
        if (this.failedInstances.has(server.instance.id)) {
          if (this.config.enableLogging) {
            console.warn(`Skipping recently failed instance: ${server.instance.id}`);
          }
          continue;
        }
        
        return server;
      } catch (error) {
        if (this.config.enableLogging) {
          console.error(`Attempt ${attempt + 1} failed to get server:`, error);
        }
        
        if (attempt < this.config.retries - 1) {
          await this.delay(this.config.retryDelay * (attempt + 1));
        }
      }
    }
    
    throw new Error("Failed to get available server after all retries");
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private extractFileIdFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url, 'http://localhost');
      if (urlObj.pathname === '/files/download' || urlObj.pathname === '/files/delete') {
        return urlObj.searchParams.get('file_id');
      }
      return null;
    } catch {
      return null;
    }
  }

  private async getSpecificInstanceForFile(fileId: string): Promise<InstanceInfo | null> {
    try {
      const fileMetadata = await this.repository.getFileMetadata(fileId);
      if (!fileMetadata) {
        if (this.config.enableLogging) {
          console.warn(`File metadata not found for file_id: ${fileId}`);
        }
        return null;
      }

      const instance = await this.repository.getInstanceById(fileMetadata.server_id);
      if (!instance) {
        if (this.config.enableLogging) {
          console.warn(`Instance not found for server_id: ${fileMetadata.server_id}`);
        }
        return null;
      }

      return {
        instance,
        healthInfo: {
          used_space: instance.used_space,
          service_type: "file-storage",
          cpu_usage: 0,
          memory_usage: 0,
        },
        responseTime: 0,
      };
    } catch (error) {
      if (this.config.enableLogging) {
        console.error(`Error getting specific instance for file ${fileId}:`, error);
      }
      return null;
    }
  }

  private createProxyOptions(target: string, instanceId: string, instance?: any): any {
    return {
      target,
      changeOrigin: true,
      timeout: this.config.timeout,
      proxyTimeout: this.config.timeout,
      pathRewrite: {
        "^/api": "",
      },
      headers: {
        "X-Proxied-By": "vault-krate-balancer",
        "X-Instance-Id": instanceId,
      },
      on: {
        error: (err: any, req: any, res: any) => {
          this.failedInstances.add(instanceId);
          
          // Enhanced error logging with server details
          const serverInstance = instance;
          const errorDetails = {
            error: err.message,
            error_code: err.code,
            url: req.url,
            method: req.method,
            server_id: instanceId,
            server_identifier: serverInstance?.instance_identifier || 'unknown',
            server_url: serverInstance?.assigned_url || 'unknown',
            provider: serverInstance?.provider || 'unknown',
            timestamp: new Date().toISOString()
          };
          
          if (this.config.enableLogging) {
            console.error(`💥 Proxy error for server ${serverInstance?.instance_identifier || instanceId}:`, errorDetails);
            console.error(`🔥 Error type: ${err.code || 'UNKNOWN'}`);
            console.error(`🌐 Connection details:`, {
              target_url: serverInstance?.assigned_url,
              error_message: err.message,
              system_error: err.syscall ? `${err.syscall} ${err.code}` : 'N/A'
            });
          }

          if (res && typeof res.writeHead === 'function' && !res.headersSent) {
            // Determine error type for better user feedback
            let errorType = 'connection_error';
            let userMessage = 'The backend server is temporarily unavailable';
            
            if (err.code === 'ECONNREFUSED') {
              errorType = 'connection_refused';
              userMessage = 'Connection refused by backend server';
            } else if (err.code === 'ETIMEDOUT') {
              errorType = 'timeout';
              userMessage = 'Backend server response timeout';
            } else if (err.code === 'ENOTFOUND') {
              errorType = 'dns_error';
              userMessage = 'Backend server address not found';
            } else if (err.code === 'ECONNRESET') {
              errorType = 'connection_reset';
              userMessage = 'Connection reset by backend server';
            }

            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: "Bad Gateway",
              message: userMessage,
              error_type: errorType,
              failed_server: {
                server_id: instanceId,
                server_identifier: serverInstance?.instance_identifier || 'unknown',
                server_url: serverInstance?.assigned_url || 'unknown',
                provider: serverInstance?.provider || 'unknown'
              },
              error_details: {
                original_error: err.message,
                error_code: err.code,
                requested_url: req.url,
                method: req.method,
                syscall: err.syscall || null
              },
              troubleshooting: {
                possible_causes: [
                  'Backend server is down or not responding',
                  'Network connectivity issues',
                  'Server overload or maintenance',
                  'Configuration problems'
                ],
                next_steps: [
                  'The request will be automatically retried with another server if available',
                  'Check server status in admin dashboard',
                  'Contact system administrator if problem persists'
                ]
              },
              timestamp: new Date().toISOString(),
            }));
          }
        },
        proxyReq: (_proxyReq: any, req: any) => {
          if (this.config.enableLogging) {
            console.log(`Proxying ${req.method} ${req.url} to instance ${instanceId}`);
          }
        },
        proxyRes: (proxyRes: any, req: any) => {
          if (this.config.enableLogging && proxyRes.statusCode && proxyRes.statusCode >= 400) {
            console.warn(`Instance ${instanceId} returned ${proxyRes.statusCode} for ${req.method} ${req.url}`);
          }
        },
      },
    };
  }

  handle = async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    try {
      let target: InstanceInfo;
      
      const fileId = this.extractFileIdFromUrl(req.url || '');
      
      if (fileId) {
        const operation = req.url?.includes('/files/delete') ? 'delete' : 'download';
        if (this.config.enableLogging) {
          console.log(`File ${operation} request detected for file_id: ${fileId}`);
        }
        
        const specificInstance = await this.getSpecificInstanceForFile(fileId);
        
        if (specificInstance) {
          target = specificInstance;
          if (this.config.enableLogging) {
            console.log(`Routing file ${operation} ${fileId} to specific instance: ${target.instance.id} (${target.instance.assigned_url})`);
          }
        } else {
          if (this.config.enableLogging) {
            console.warn(`Could not find specific instance for file ${fileId}, falling back to load balancer`);
          }
          target = await this.getServerWithRetry();
          if (this.config.enableLogging) {
            console.log(`Load balancer selected instance: ${target.instance.id} (${target.instance.assigned_url})`);
          }
        }
      } else {
        target = await this.getServerWithRetry();
        if (this.config.enableLogging) {
          console.log(`Load balancer selected instance: ${target.instance.id} (${target.instance.assigned_url})`);
        }
      }
      
      req.headers["X-Forwarded-For"] = target.instance.id;
      req.headers["X-Original-Host"] = req.headers.host || "";
      req.headers["X-Request-Start"] = startTime.toString();
      
      if (fileId) {
        req.headers["X-File-ID"] = fileId;
      }

      const proxyOptions = this.createProxyOptions(
        target.instance.assigned_url,
        target.instance.id,
        target.instance
      );

      const proxy = createProxyMiddleware(proxyOptions);
      
      res.on("finish", () => {
        const duration = Date.now() - startTime;
        if (this.config.enableLogging) {
          const fileInfo = fileId ? ` (file: ${fileId})` : '';
          console.log(`Request completed in ${duration}ms - Status: ${res.statusCode}${fileInfo}`);
        }
      });

      proxy(req, res, next);
      
    } catch (error) {
      if (this.config.enableLogging) {
        console.error("Failed to handle proxy request:", error);
      }
      
      if (!res.headersSent) {
        res.status(503).json({
          error: "Service Unavailable",
          message: "No healthy servers available",
          timestamp: new Date().toISOString(),
        });
      }
    }
  };

  getFailedInstancesCount(): number {
    return this.failedInstances.size;
  }

  clearFailedInstances(): void {
    this.failedInstances.clear();
    if (this.config.enableLogging) {
      console.log("Manually cleared failed instances cache");
    }
  }

  updateConfig(newConfig: Partial<ProxyConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (this.config.enableLogging) {
      console.log("Proxy configuration updated:", this.config);
    }
  }
}

export default Proxy;
