import express from "express";
import cors from "cors";
import Repository from "./repository";
import { SpaceStrategy } from "./strategies";
import Balancer from "./balancer";
import Proxy from "./proxy";

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["content-type", "authorization", "accept", "origin", "user-agent", "x-requested-with"],
  maxAge: 3600
}));

app.use((req, res, next) => {
  let strategy = new SpaceStrategy();
  let repo = new Repository();
  let balancer = new Balancer(strategy, repo);
  let proxy = new Proxy(balancer, repo);
  proxy.handle(req, res, next);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Vault-Krate Balancer running on port ${PORT}`);
  });
}

module.exports = app;
