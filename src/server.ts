import express from "express";
import Repository from "./repository";
import { SpaceStrategy } from "./strategies";
import Balancer from "./balancer";
import Proxy from "./proxy";

const app = express();

app.use((req, res, next) => {
  let strategy = new SpaceStrategy();
  let repo = new Repository();
  let balancer = new Balancer(strategy, repo);
  let proxy = new Proxy(balancer);
  proxy.handle(req, res, next);
});

module.exports = app;
