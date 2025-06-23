import { NextFunction, Request, Response } from "express";
import Balancer from "./balancer";
import { createProxyMiddleware } from "http-proxy-middleware";

class Proxy {
  constructor(private balancer: Balancer) {}
  getServer = async () => {
    const server = await this.balancer.getServer();
    return server;
  };
  handle = async (req: Request, res: Response, next: NextFunction) => {
    const target = await this.getServer();
    req.headers["X-Forwarded-For"] = target.instance.id;
    let proxy = createProxyMiddleware({
      target: target.instance.assigned_url,
      changeOrigin: true,
      pathRewrite: {
        "^/api": "",
      },
    });
    proxy(req, res, next);
  };
}

export default Proxy;
