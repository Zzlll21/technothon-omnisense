import { supabase } from "./supabaseClient.js";

export async function insertReading(normalizedTelemetry) {
  const row = toSensorReadingRow(normalizedTelemetry);

  const { data, error } = await supabase
    .from("sensor_readings")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    throw new Error(
      `Supabase insert failed: ${error.code ?? "NO_CODE"} ${error.message}`
    );
  }

  return data;
}

function toSensorReadingRow(normalizedTelemetry) {
  const row = {
    node_id: normalizedTelemetry.node_id,
    temperature: normalizedTelemetry.temperature,
    humidity: normalizedTelemetry.humidity,
    headcount: normalizedTelemetry.headcount,
    pmv: normalizedTelemetry.pmv,
    crisis_mode: normalizedTelemetry.crisis_mode,
    raw_payload: normalizedTelemetry.raw_payload
  };

  if (normalizedTelemetry.recorded_at !== undefined) {
    row.recorded_at = normalizedTelemetry.recorded_at;
  }

  if (normalizedTelemetry.hvac_state !== undefined) {
    row.hvac_state = normalizedTelemetry.hvac_state;
  }

  if (normalizedTelemetry.air_quality !== undefined) {
    row.air_quality = normalizedTelemetry.air_quality;
  }

  return row;
}

