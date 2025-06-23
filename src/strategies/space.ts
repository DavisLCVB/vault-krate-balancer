import { Strategy } from ".";
import { InstanceInfo } from "../types";
import supabase from "../lib/supabase";

export class SpaceStrategy implements Strategy {
  name: string = "space_strategy";
  private config: {
    spaceWeight: number;
    responseTimeWeight: number;
    maxSpaceThreshold: number;
    minResponseTimeThreshold: number;
  } = {
    spaceWeight: 0.6,
    responseTimeWeight: 0.4,
    maxSpaceThreshold: 0.8, // 80% de espacio usado máximo
    minResponseTimeThreshold: 500, // 500ms mínimo
  };

  constructor() {}

  async load() {
    try {
      const { data, error } = await supabase
        .from("strategy_state")
        .select("configuration")
        .eq("strategy_name", this.name)
        .single();

      if (!error && data) {
        this.config = { ...this.config, ...data.configuration };
      }
    } catch (err) {
      console.error("Error loading strategy config:", err);
    }
  }

  async save() {
    try {
      const { error } = await supabase.from("strategy_state").upsert(
        {
          strategy_name: this.name,
          configuration: this.config,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "strategy_name" }
      );

      if (error) throw error;
    } catch (err) {
      console.error("Error saving strategy config:", err);
    }
  }

  select(instances: InstanceInfo[]): InstanceInfo {
    if (instances.length === 0) {
      throw new Error("No instances available");
    }

    // Filtrar instancias que exceden los umbrales
    const viableInstances = instances.filter((instance) => {
      const spaceUsage = instance.instance.used_space;
      const responseTime = instance.responseTime;

      return (
        spaceUsage <= this.config.maxSpaceThreshold &&
        responseTime >= this.config.minResponseTimeThreshold
      );
    });

    // Si no hay instancias viables, relajar los criterios
    const candidates = viableInstances.length > 0 ? viableInstances : instances;

    // Calcular puntuación para cada instancia
    const scoredInstances = candidates.map((instance) => {
      const spaceScore =
        1 - instance.instance.used_space / this.config.maxSpaceThreshold;
      const responseScore =
        this.config.minResponseTimeThreshold /
        Math.max(instance.responseTime, 1);

      const totalScore =
        spaceScore * this.config.spaceWeight +
        responseScore * this.config.responseTimeWeight;

      return {
        instance,
        score: totalScore,
      };
    });

    // Ordenar por puntuación (mayor primero)
    scoredInstances.sort((a, b) => b.score - a.score);

    // Seleccionar la mejor instancia
    const selected = scoredInstances[0].instance;

    // Opcional: registrar la selección
    this.logSelection(selected);

    return selected;
  }

  private logSelection(instance: InstanceInfo) {
    console.log(
      `Selected instance ${instance.instance.instance_identifier} - ` +
        `Space: ${instance.instance.used_space}, ` +
        `Response: ${instance.responseTime}ms`
    );
  }

  // Método para actualizar configuración
  async updateConfig(newConfig: Partial<typeof this.config>) {
    this.config = { ...this.config, ...newConfig };
    await this.save();
  }
}
