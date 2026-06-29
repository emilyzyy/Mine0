// Worker management CLI — deploy, start, health-check, and stop the persistent worker.
//
// Usage:
//   npm run jarvis:worker start    — SCP worker file to RunPod and start it
//   npm run jarvis:worker health   — curl /health through SSH
//   npm run jarvis:worker stop     — POST /close through SSH
//   npm run jarvis:worker logs     — tail remote worker log

import { spawn } from "node:child_process";
import { loadJarvisConfig } from "./shared/config.ts";

const command = process.argv[2]?.trim() ?? "health";
const config = loadJarvisConfig();
const workerPort = config.workerPort;

const SSH_OPTS = [
  "-o", "StrictHostKeyChecking=no",
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=30",
  "-p", String(config.port),
  "-i", config.keyPath,
];
const REMOTE = `${config.user}@${config.host}`;
const REMOTE_DIR = `${config.remoteRepo}/mine0_persistent`;
const CONDA_PREAMBLE = [
  "source /workspace/miniconda3/etc/profile.d/conda.sh",
  "conda activate minestudio",
  "export HF_HUB_ENABLE_HF_TRANSFER=0",
  "export HF_HOME=/workspace/hf_cache",
  "unset TRANSFORMERS_CACHE",
  'export JAVA_HOME="$CONDA_PREFIX"',
  'export PATH="$CONDA_PREFIX/bin:$PATH"',
].join(" && ");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runCmd(
  prog: string,
  args: string[],
  { printOutput = true } = {},
): Promise<{ exitCode: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(prog, args, { stdio: printOutput ? "inherit" : "pipe" });
    const chunks: Buffer[] = [];
    if (!printOutput && child.stdout) {
      child.stdout.on("data", (c: Buffer) => chunks.push(c));
    }
    child.on("close", (code) => resolve({
      exitCode: code ?? 1,
      stdout: Buffer.concat(chunks).toString("utf8"),
    }));
    child.on("error", reject);
  });
}

function ssh(remoteCmd: string, opts?: { printOutput?: boolean }) {
  return runCmd("ssh", [...SSH_OPTS, REMOTE, remoteCmd], opts);
}

function scp(localPath: string, remotePath: string) {
  return runCmd("scp", ["-P", String(config.port), "-i", config.keyPath, localPath, `${REMOTE}:${remotePath}`]);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

if (command === "start") {
  // 1. Create remote directory
  console.log(`Creating ${REMOTE_DIR} on RunPod…`);
  await ssh(`mkdir -p ${REMOTE_DIR}`);

  // 2. SCP the worker file
  const localWorker = new URL("../remote/jarvis_persistent_worker.py", import.meta.url).pathname;
  console.log(`Deploying worker from ${localWorker}…`);
  await scp(localWorker, REMOTE_DIR + "/jarvis_persistent_worker.py");

  // 3. Start the worker in the background with xvfb-run.
  //    Each step is separated by && so the chain aborts on failure.
  //    We use an absolute log path so nohup's cwd doesn't matter.
  const LOG = `${REMOTE_DIR}/worker.log`;
  // Wrap the nohup in a subshell so we can chain subsequent commands with &&.
  // `&;` is rejected by bash 5.2 on this host; `(nohup ... &)` works correctly.
  const startCmd =
    `${CONDA_PREAMBLE}` +
    ` && cd ${config.remoteRepo}` +
    ` && (nohup xvfb-run -a -n 99 python -u mine0_persistent/jarvis_persistent_worker.py --port ${workerPort} > ${LOG} 2>&1 &)` +
    ` && sleep 4` +
    ` && (curl -s http://127.0.0.1:${workerPort}/health || echo '(not yet up — tail ${LOG})')`;

  console.log("Starting persistent worker…");
  await ssh(startCmd);

} else if (command === "health") {
  console.log(`Checking worker health (port ${workerPort})…`);
  const { exitCode, stdout } = await ssh(
    `curl -s http://127.0.0.1:${workerPort}/health`,
    { printOutput: false },
  );
  if (exitCode !== 0 || !stdout.trim()) {
    console.error("Worker unreachable or not running.");
    process.exit(1);
  }
  const health = JSON.parse(stdout);
  console.log(JSON.stringify(health, null, 2));

} else if (command === "stop") {
  console.log("Sending POST /close to worker…");
  await ssh(`curl -s -X POST http://127.0.0.1:${workerPort}/close`);

} else if (command === "logs") {
  console.log("Tailing remote worker log…");
  await ssh(`tail -50 ${REMOTE_DIR}/worker.log`);

} else {
  console.error(`Unknown command: ${command}`);
  console.error("Usage: npm run jarvis:worker [start|health|stop|logs]");
  process.exit(1);
}
