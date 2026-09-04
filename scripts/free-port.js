const { execSync } = require("child_process");
const {
  parseExcludedPortRanges,
  findRangeContaining,
} = require("./excluded-port-ranges");

const port = process.argv[2] || "3000";

/**
 * WHAT THIS SCRIPT IS FOR, and what it deliberately is not.
 *
 * It runs as `predev` and clears a leftover dev server off the port. It
 * DIAGNOSES; it does not decide. It never exits non-zero and never picks a
 * different port on its own — the launch belongs to whoever typed the command.
 *
 * The reason it also looks at excluded ranges: on 04.09.2026 Windows had
 * reserved 2939-3038, which swallows 3000. Nothing was listening, so this
 * script said the port was free — formally true, and useless. Next then failed
 * with EACCES, naming neither the range nor the cause, and half an hour went
 * into finding out. "Not found" must never be printed as "all fine".
 *
 * A script that KILLS must never be tested by running it — check with netstat
 * or Get-Process instead; running this one to see what it says cost a dev
 * server on 04.09.2026.
 */

/** Ranges Windows has taken for itself, or an empty list if we cannot tell. */
function excludedRanges() {
  if (process.platform !== "win32") {
    return [];
  }
  try {
    const output = execSync(
      "netsh interface ipv4 show excludedportrange protocol=tcp",
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return parseExcludedPortRanges(output);
  } catch {
    // netsh missing, refused, or changed: unknown, not "none". The caller says
    // so rather than implying the port is fine.
    return null;
  }
}

/**
 * Nobody is listening. That is the START of the answer, not the end of it.
 */
function reportNoListener(targetPort) {
  const ranges = excludedRanges();

  if (ranges === null) {
    console.log(
      `Порт ${targetPort}: слушателя нет. Изъятые системой диапазоны проверить не удалось (netsh не ответил), поэтому «свободен» здесь не утверждается.`,
    );
    return;
  }

  const range = findRangeContaining(ranges, targetPort);
  if (range === null) {
    console.log(`Порт ${targetPort} свободен.`);
    return;
  }

  // The port is unusable and nothing else will say so until the bind fails.
  console.log(
    `Порт ${targetPort}: слушателя нет, но система изъяла диапазон ${range.start}-${range.end}, и порт попал в него. Слушать его запрещено — запуск упадёт с EACCES, и в ошибке не будет ни порта, ни причины.`,
  );
  console.log(
    "Что делать: взять порт вне изъятых диапазонов или перезагрузить машину — при загрузке диапазоны выдаются заново. Полный список: netsh interface ipv4 show excludedportrange protocol=tcp",
  );
  console.log(
    "Запуск НЕ остановлен: этот скрипт диагностирует, а решение за вами.",
  );
}

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
        reportNoListener(targetPort);
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
        reportNoListener(targetPort);
        return;
      }
      output.split("\n").forEach((pid) => {
        execSync(`kill -9 ${pid}`);
        console.log(`Порт ${targetPort}: остановлен процесс ${pid}.`);
      });
    }
  } catch {
    // netstat/findstr/lsof exit non-zero when nothing matches. On Windows that
    // is the ORDINARY path for a free port, so the answer is decided in one
    // place rather than assumed here.
    reportNoListener(targetPort);
  }
}

freePort(port);
