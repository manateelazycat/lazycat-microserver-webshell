import { writeSync } from "node:fs";

export function reportStandaloneRunTime() {
  const started = performance.now();
  if (process.env.WEBSHELL_TIMING_OWNER || process.argv.includes("--dry-run") || process.env.TESTS_AUTO_DRY_RUN === "1") return;
  process.once("exit", () => {
    const milliseconds = Math.round(performance.now() - started);
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor(milliseconds / 60000) % 60;
    const seconds = (milliseconds % 60000) / 1000;
    writeSync(2, `测试总用时：${hours ? `${hours} 小时 ` : ""}${minutes} 分 ${seconds.toFixed(3)} 秒（${(milliseconds / 1000).toFixed(3)}s）\n`);
  });
}
