import supabase from "./lib/supabase";

interface FileMetadata {
  file_id: string;
  mime_type: string;
  size: number;
  user_id: string;
  description: string;
  file_name: string;
  server_id: string;
  uploaded_at: string;
  download_count: number;
  last_access: string;
  delete_at?: string;
}

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

  async getFileMetadata(fileId: string): Promise<FileMetadata | null> {
    const { data, error } = await supabase
      .schema("application")
      .from("file_metadata")
      .select("*")
      .eq("id", fileId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }
    
    return data;
  }

  async getInstanceById(instanceId: string) {
    const { data, error } = await supabase
      .schema("infrastructure")
      .from("instances")
      .select("*")
      .eq("id", instanceId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }
    
    return data;
  }
}

export default Repository;
