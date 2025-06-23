import supabase from "./lib/supabase";

class Repository {
  constructor() {}
  async getInstances() {
    const { data, error } = await supabase
      .schema("infrastructure")
      .from("instances")
      .select("*");
    if (error) {
      throw error;
    }
    return data;
  }
}

export default Repository;
