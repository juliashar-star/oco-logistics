const { execSync } = require("child_process");

const port = process.argv[2] || "3000";

function freePort(targetPort) {
  try {
    if (process.platform === "win32") {
      const output = execSync(`netstat -ano | findstr :${targetPort}`, {
        encoding: "utf-8",
      });
      const pids = new Set();
      for (const line of output.split("\n")) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0" && /^\d+$/.test(pid)) pids.add(pid);
      }
      if (pids.size === 0) {
        console.log(`Порт ${targetPort} свободен.`);
        return;
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`);
          console.log(`Порт ${targetPort}: остановлен процесс ${pid}.`);
        } catch {
          // process may already be gone — ignore
        }
      }
    } else {
      let output = "";
      try {
        output = execSync(`lsof -ti:${targetPort}`, { encoding: "utf-8" }).trim();
      } catch {
        output = "";
      }
      if (!output) {
        console.log(`Порт ${targetPort} свободен.`);
        return;
      }
      output.split("\n").forEach((pid) => {
        execSync(`kill -9 ${pid}`);
        console.log(`Порт ${targetPort}: остановлен процесс ${pid}.`);
      });
    }
  } catch {
    // netstat/findstr/lsof exit non-zero when nothing matches — that's fine
    console.log(`Порт ${targetPort} свободен.`);
  }
}

freePort(port);
