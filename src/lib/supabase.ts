import { createClient } from "@supabase/supabase-js";
import environment from "./environment";

// Create a single supabase client for interacting with your database
const supabase = createClient(
  environment.SUPABASE_URL,
  environment.SUPABASE_KEY
);

export default supabase;
