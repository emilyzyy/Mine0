#!/usr/bin/env python3
"""
Mine0 persistent JARVIS worker — runs inside the RunPod 'minestudio' conda env.

Starts MineStudio / Minecraft ONCE and keeps it alive across many /run_goal calls,
so each subgoal does NOT pay the Minecraft startup cost.

Deployment (run from /workspace/JarvisVLA with minestudio activated):
    mkdir -p mine0_persistent
    cp mine0_persistent/jarvis_persistent_worker.py mine0_persistent/
    xvfb-run -a -n 99 python -u mine0_persistent/jarvis_persistent_worker.py \
        --port 8765 > mine0_persistent/worker.log 2>&1 &

Routes:
    GET  /health    → { status, session_id, cumulative_step, env_alive, started_at }
    POST /reset     → start or hard-reset the Minecraft env + agent
    POST /run_goal  → run N frames in the already-open env (the persistent step)
    POST /close     → cleanly close Minecraft
"""

import argparse
import collections
import inspect
import json
import logging
import os
import sys
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from socketserver import TCPServer, ThreadingMixIn

# ---------------------------------------------------------------------------
# Paths (all relative to this file's location: /workspace/JarvisVLA/mine0_persistent/)
# ---------------------------------------------------------------------------
WORKER_DIR = Path(__file__).parent                     # .../mine0_persistent/
JARVIS_REPO = WORKER_DIR.parent                        # /workspace/JarvisVLA
CONFIG_BASE = JARVIS_REPO / "jarvisvla" / "evaluate" / "config"
SCREENSHOT_PATH = WORKER_DIR / "latest_pov.png"

logger = logging.getLogger("mine0_worker")

# ---------------------------------------------------------------------------
# Global mutable state — _lock serialises /reset and /run_goal
# ---------------------------------------------------------------------------
_lock = threading.Lock()
_s: dict = {
    "env":                 None,
    "agent":               None,
    "last_info":           None,
    "instructions":        None,
    "need_crafting_table": False,
    "session_id":          None,
    "cumulative_step":     0,
    "started_at":          None,
    "env_config":          None,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_hydra_cfg(env_config: str):
    """Load the merged hydra config for env_config (e.g. 'kill/kill_zombie')."""
    import hydra
    from hydra.core.global_hydra import GlobalHydra

    GlobalHydra.instance().clear()
    cfg_path = Path(env_config)
    config_dir = str(CONFIG_BASE / cfg_path.parent)
    config_name = cfg_path.stem
    hydra.initialize_config_dir(config_dir=config_dir, version_base="1.3")
    return hydra.compose(config_name=config_name)


def _build_env(env_config: str) -> tuple:
    """Construct MinecraftSim with standard callbacks.  Returns (env, obs, info, cfg)."""
    from minestudio.simulator import MinecraftSim
    from minestudio.simulator.entry import CameraConfig
    from minestudio.simulator.callbacks import (
        CommandsCallback,
        FastResetCallback,
        InitInventoryCallback,
        RewardsCallback,
        SpeedTestCallback,
        SummonMobsCallback,
        TaskCallback,
    )

    cfg = _load_hydra_cfg(env_config)
    camera_cfg = CameraConfig(**cfg.camera_config)

    callbacks = [
        FastResetCallback(
            biomes=cfg.candidate_preferred_spawn_biome,
            random_tp_range=cfg.random_tp_range,
            start_time=cfg.start_time,
        ),
        SpeedTestCallback(50),
        TaskCallback(getattr(cfg, "task_conf", None)),
        RewardsCallback(getattr(cfg, "reward_conf", None)),
        InitInventoryCallback(
            cfg.init_inventory,
            **{
                k: v
                for k, v in {
                    "inventory_distraction_level": getattr(cfg, "inventory_distraction_level", None),
                    "equip_distraction_level": "normal",
                }.items()
                if k in inspect.signature(InitInventoryCallback.__init__).parameters
            },
        ),
        CommandsCallback(getattr(cfg, "command", []) or []),
    ]
    if getattr(cfg, "mobs", None):
        callbacks.append(SummonMobsCallback(cfg.mobs))

    env = MinecraftSim(
        action_type="env",
        seed=cfg.seed,
        obs_size=cfg.origin_resolution,
        render_size=cfg.resize_resolution,
        camera_config=camera_cfg,
        preferred_spawn_biome=getattr(cfg, "preferred_spawn_biome", None),
        callbacks=callbacks,
    )
    obs, info = env.reset()
    env.action_type = "agent"  # switch to agent mode for action stepping

    instructions = [item["text"] for item in cfg.task_conf]
    need_crafting_table = getattr(cfg, "need_crafting_table", False)

    return env, obs, info, cfg, instructions, need_crafting_table


def _build_agent(checkpoints: str, base_url: str, model_cfg: dict):
    """Create VLLM_AGENT.  Connects to already-running vLLM server — no weight loading."""
    from jarvisvla.evaluate import agent_wrapper
    return agent_wrapper.VLLM_AGENT(
        checkpoint_path=checkpoints,
        base_url=base_url,
        **model_cfg,
    )


def _action_to_dict(action) -> dict:
    """Convert OrderedDict / dict action to a plain JSON-serialisable dict."""
    try:
        raw = dict(action) if isinstance(action, (dict, collections.OrderedDict)) else {}
        return {k: int(v) if hasattr(v, "item") else v for k, v in raw.items()}
    except Exception:
        return {}


def _save_screenshot(pov) -> str | None:
    try:
        import numpy as np
        from PIL import Image
        if pov is not None:
            Image.fromarray(pov.astype("uint8")).save(str(SCREENSHOT_PATH))
            return str(SCREENSHOT_PATH)
    except Exception as exc:
        logger.warning("Screenshot save failed: %s", exc)
    return None


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class WorkerHandler(BaseHTTPRequestHandler):

    # ── GET /health ───────────────────────────────────────────────────────
    def do_GET(self):
        if self.path == "/health":
            self._json(200, {
                "status": "ok",
                "session_id": _s["session_id"],
                "env_alive": _s["env"] is not None,
                "cumulative_step": _s["cumulative_step"],
                "started_at": _s["started_at"],
                "env_config": _s["env_config"],
            })
        else:
            self._json(404, {"error": "not found"})

    # ── POST dispatcher ───────────────────────────────────────────────────
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        if self.path == "/reset":
            self._handle_reset(body)
        elif self.path == "/run_goal":
            self._handle_run_goal(body)
        elif self.path == "/close":
            self._handle_close()
        else:
            self._json(404, {"error": "not found"})

    # ── POST /reset ───────────────────────────────────────────────────────
    def _handle_reset(self, body: dict):
        env_config  = body.get("envConfig",     "kill/kill_zombie")
        base_url    = body.get("baseUrl",        "http://127.0.0.1:8000/v1")
        checkpoints = body.get("checkpoints",    "CraftJarvis/JarvisVLA-Qwen2-VL-7B")
        model_cfg   = {
            "temperature":    body.get("temperature",    0.01),
            "history_num":    body.get("historyNum",     0),
            "instruction_type": body.get("instructionType", "normal"),
            "action_chunk_len": body.get("actionChunkLen",  1),
        }
        prev_session = _s["session_id"]

        try:
            with _lock:
                # Close old env if env_config changed
                if _s["env"] is not None and _s["env_config"] != env_config:
                    logger.info("env_config changed — closing old env.")
                    try:
                        _s["env"].close()
                    except Exception:
                        pass
                    _s["env"] = None

                if _s["env"] is None:
                    # First call: start Minecraft (expensive — ~30-60s)
                    logger.info("Starting Minecraft env for %s …", env_config)
                    env, obs, info, cfg, instructions, need_ct = _build_env(env_config)
                    _s["env"]                 = env
                    _s["last_info"]           = info
                    _s["instructions"]        = instructions
                    _s["need_crafting_table"] = need_ct
                    _s["env_config"]          = env_config

                    logger.info("Connecting VLLM agent …")
                    _s["agent"] = _build_agent(checkpoints, base_url, model_cfg)
                else:
                    # Subsequent call: reset the world (same Java process — fast)
                    logger.info("Resetting existing Minecraft env …")
                    _obs, info = _s["env"].reset()
                    _s["last_info"] = info
                    if _s["agent"]:
                        _s["agent"].reset()

                new_sid = str(uuid.uuid4())[:8]
                _s["session_id"]      = new_sid
                _s["cumulative_step"] = 0
                _s["started_at"]      = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

            self._json(200, {
                "sessionId":      _s["session_id"],
                "prevSessionId":  prev_session,
                "cumulativeStep": 0,
                "envConfig":      env_config,
                "startedAt":      _s["started_at"],
            })
        except Exception:
            self._json(500, {"error": traceback.format_exc()})

    # ── POST /run_goal ────────────────────────────────────────────────────
    def _handle_run_goal(self, body: dict):
        with _lock:
            if _s["env"] is None or _s["session_id"] is None:
                self._json(400, {"error": "No active session — call POST /reset first."})
                return

            max_frames           = int(body.get("maxFrames", 5))
            verbos               = bool(body.get("verbos", False))
            instruction_override = body.get("instruction")

            env               = _s["env"]
            agent             = _s["agent"]
            info              = _s["last_info"]
            instructions      = _s["instructions"]
            need_ct           = _s["need_crafting_table"]

            if instruction_override:
                instructions = [instruction_override]

            cumulative_before = _s["cumulative_step"]
            actions_log: list[dict] = []
            screenshot_path: str | None = None
            task_succeeded: bool | None = None
            t0 = time.time()

            try:
                for _step in range(max_frames):
                    action = agent.forward(
                        [info["pov"]],
                        instructions,
                        verbos=verbos,
                        need_crafting_table=need_ct,
                    )
                    obs, reward, terminated, truncated, info = env.step(action)
                    _s["cumulative_step"] += 1
                    actions_log.append(_action_to_dict(action))

                    if reward > 0:
                        task_succeeded = True

                    screenshot_path = _save_screenshot(info.get("pov"))

                    if terminated or truncated:
                        logger.info("Episode ended (terminated=%s truncated=%s)", terminated, truncated)
                        break

                _s["last_info"] = info
                duration = round(time.time() - t0, 1)

                self._json(200, {
                    "sessionId":          _s["session_id"],
                    "reusedSession":      True,
                    "cumulativeStepBefore": cumulative_before,
                    "cumulativeStepAfter":  _s["cumulative_step"],
                    "actionCount":        len(actions_log),
                    "actions":            actions_log,
                    "durationSeconds":    duration,
                    "remoteExecutionSucceeded": True,
                    "taskSucceeded":      task_succeeded,
                    "latestScreenshotPath": screenshot_path,
                    "videoPath":          None,
                    "error":              None,
                })

            except Exception:
                err = traceback.format_exc()
                logger.error("run_goal error: %s", err)
                self._json(500, {
                    "sessionId":          _s["session_id"],
                    "reusedSession":      True,
                    "cumulativeStepBefore": cumulative_before,
                    "cumulativeStepAfter":  _s["cumulative_step"],
                    "actionCount":        len(actions_log),
                    "actions":            actions_log,
                    "durationSeconds":    round(time.time() - t0, 1),
                    "remoteExecutionSucceeded": False,
                    "taskSucceeded":      False,
                    "latestScreenshotPath": screenshot_path,
                    "videoPath":          None,
                    "error":              err,
                })

    # ── POST /close ───────────────────────────────────────────────────────
    def _handle_close(self):
        with _lock:
            if _s["env"] is not None:
                try:
                    _s["env"].close()
                except Exception as exc:
                    logger.warning("env.close() error: %s", exc)
                _s["env"]            = None
                _s["agent"]          = None
                _s["session_id"]     = None
                _s["cumulative_step"] = 0
                logger.info("Minecraft env closed.")
        self._json(200, {"status": "closed"})

    # ── Utilities ─────────────────────────────────────────────────────────
    def _json(self, status: int, data: dict):
        payload = json.dumps(data, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt: str, *args):
        logger.debug("HTTP " + fmt, *args)


# ---------------------------------------------------------------------------
# Threaded server so /health responds even during a long /run_goal
# ---------------------------------------------------------------------------
class _ThreadedServer(ThreadingMixIn, TCPServer):
    allow_reuse_address = True
    daemon_threads = True


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Mine0 persistent JARVIS worker")
    ap.add_argument("--host",      default="127.0.0.1", help="Bind address (keep loopback)")
    ap.add_argument("--port",      type=int, default=8765)
    ap.add_argument("--log-level", default="INFO")
    args = ap.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
        force=True,
    )

    WORKER_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Mine0 persistent JARVIS worker — %s:%s", args.host, args.port)
    logger.info("Repo: %s  |  Config base: %s", JARVIS_REPO, CONFIG_BASE)

    server = _ThreadedServer((args.host, args.port), WorkerHandler)
    logger.info("Listening. POST /reset to start Minecraft.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Interrupted — shutting down.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
