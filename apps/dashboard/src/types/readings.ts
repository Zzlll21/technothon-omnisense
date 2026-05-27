export type HvacState = {
  mode?: string;
  fan?: string;
  setpoint?: number;
  [key: string]: unknown;
};

export type SensorReading = {
  id: string;
  node_id: string;
  recorded_at: string;
  temperature: number | null;
  humidity: number | null;
  headcount: number | null;
  pmv: number | null;
  crisis_mode: boolean;
  hvac_state: HvacState | null;
  air_quality: number | null;
  raw_payload: Record<string, unknown>;
};

export type QueryState<T> =
  | {
      status: "loading";
      data: T;
      error: null;
      isEmpty: boolean;
    }
  | {
      status: "success";
      data: T;
      error: null;
      isEmpty: boolean;
    }
  | {
      status: "error";
      data: T;
      error: string;
      isEmpty: boolean;
    };

export type ReadingHistoryOptions = {
  limit?: number;
  ascending?: boolean;
};
