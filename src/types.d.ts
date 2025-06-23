export interface Instance {
  id: string;
  instance_identifier: string;
  provider: string;
  assigned_url: string;
  started_at: Date;
  last_heartbeat: Date;
  configuration: Record<string, unknown>;
  used_space: number;
}

export interface Environment {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

export interface HealthInfo {
  used_space: number;
  service_type: string;
  cpu_usage: number;
  memory_usage: number;
}

export interface InstanceInfo {
  instance: Instance;
  healthInfo: HealthInfo;
  responseTime: number;
}
