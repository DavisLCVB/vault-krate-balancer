import { Environment } from "@/types";
import dotenv from "dotenv";
dotenv.config();

const environment: Environment = {
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_KEY: process.env.SUPABASE_KEY!,
};

const checkEnvironment = (environment: Environment) => {
  if (!environment.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not set");
  }
  if (!environment.SUPABASE_KEY) {
    throw new Error("SUPABASE_KEY is not set");
  }
};

checkEnvironment(environment);

export default environment;
