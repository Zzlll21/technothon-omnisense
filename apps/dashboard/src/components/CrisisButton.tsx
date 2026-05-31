import { Power, PowerOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sendCrisisCommand } from "../api/crisis";
import type { QueryState, SensorReading } from "../types/readings";

type CrisisButtonProps = {
  readingsState: QueryState<SensorReading[]>;
};

type CommandMessage =
  | {
      tone: "success";
      text: string;
    }
  | {
      tone: "error";
      text: string;
    }
  | null;

const DEFAULT_NODE_ID = "demo-1";
const TARGET_PMV_LIMIT = 1.0;
const COMMAND_REASON = "dashboard_demo";
const COMMAND_COOLDOWN_MS = 2000;

export function CrisisButton({ readingsState }: CrisisButtonProps) {
  const nodeOptions = useMemo(() => getNodeOptions(readingsState), [readingsState]);
  const [selectedNodeId, setSelectedNodeId] = useState(nodeOptions[0] ?? DEFAULT_NODE_ID);
  const [isPending, setIsPending] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [message, setMessage] = useState<CommandMessage>(null);
  const isRequestInFlight = useRef(false);
  const cooldownTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!nodeOptions.includes(selectedNodeId)) {
      setSelectedNodeId(nodeOptions[0] ?? DEFAULT_NODE_ID);
    }
  }, [nodeOptions, selectedNodeId]);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current !== null) {
        window.clearTimeout(cooldownTimer.current);
      }
    };
  }, []);

  const controlsDisabled = isPending || isCoolingDown;

  const sendCommand = async (enabled: boolean) => {
    if (isRequestInFlight.current || isCoolingDown) {
      return;
    }

    isRequestInFlight.current = true;
    setIsPending(true);
    setMessage(null);

    try {
      const result = await sendCrisisCommand({
        node_id: selectedNodeId,
        enabled,
        target_pmv_limit: TARGET_PMV_LIMIT,
        reason: COMMAND_REASON
      });

      if (result.ok) {
        if (result.published) {
          setMessage({
            tone: "success",
            text: `Crisis mode ${enabled ? "enabled" : "disabled"} for ${selectedNodeId}. Published to ${result.topic}.`
          });
        } else {
          setMessage({
            tone: "success",
            text: result.message
          });
        }
      } else {
        setMessage({
          tone: "error",
          text: result.error
        });
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to send crisis command."
      });
    } finally {
      isRequestInFlight.current = false;
      setIsPending(false);
      startCooldown();
    }
  };

  return (
    <section className="crisis-section" aria-labelledby="crisis-control-title">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">Override Action</p>
          <h2 id="crisis-control-title">Crisis Mode Override</h2>
          <p className="muted">
            Send a backend MQTT override to the selected ESP32 node.
          </p>
        </div>
      </div>

      <div className="crisis-panel">
        <label className="select-label" htmlFor="crisis-node">
          Target Node
        </label>
        <div className="crisis-controls">
          <select
            id="crisis-node"
            className="node-select crisis-node-select"
            value={selectedNodeId}
            onChange={(event) => {
              setSelectedNodeId(event.target.value);
              setMessage(null);
            }}
            disabled={controlsDisabled}
          >
            {nodeOptions.map((nodeId) => (
              <option key={nodeId} value={nodeId}>
                {nodeId}
              </option>
            ))}
          </select>

          <button
            className="control-button control-button-critical"
            type="button"
            onClick={() => void sendCommand(true)}
            disabled={controlsDisabled}
          >
            <Power size={18} aria-hidden="true" />
            <span>{getButtonLabel("Enable Crisis Mode", isPending, isCoolingDown)}</span>
          </button>

          <button
            className="control-button"
            type="button"
            onClick={() => void sendCommand(false)}
            disabled={controlsDisabled}
          >
            <PowerOff size={18} aria-hidden="true" />
            <span>{getButtonLabel("Disable Crisis Mode", isPending, isCoolingDown)}</span>
          </button>
        </div>

        <p className="crisis-payload-note">
          {isPending
            ? "Sending command..."
            : isCoolingDown
              ? "Command sent. Please wait..."
            : `SET_CRISIS_MODE · PMV ${TARGET_PMV_LIMIT.toFixed(1)} · ${COMMAND_REASON}`}
        </p>

        {message ? (
          <div
            className={`message-panel crisis-message ${
              message.tone === "error" ? "error-panel" : "success-panel"
            }`}
            role={message.tone === "error" ? "alert" : "status"}
          >
            {message.text}
          </div>
        ) : null}
      </div>
    </section>
  );

  function startCooldown() {
    setIsCoolingDown(true);

    if (cooldownTimer.current !== null) {
      window.clearTimeout(cooldownTimer.current);
    }

    cooldownTimer.current = window.setTimeout(() => {
      setIsCoolingDown(false);
      cooldownTimer.current = null;
    }, COMMAND_COOLDOWN_MS);
  }
}

function getButtonLabel(label: string, isPending: boolean, isCoolingDown: boolean) {
  if (isPending) {
    return "Sending command...";
  }

  if (isCoolingDown) {
    return "Command sent. Please wait...";
  }

  return label;
}

function getNodeOptions(readingsState: QueryState<SensorReading[]>) {
  if (readingsState.status === "success" && readingsState.data.length > 0) {
    return readingsState.data.map((reading) => reading.node_id);
  }

  return [DEFAULT_NODE_ID];
}
