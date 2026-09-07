import { randomInt } from "node:crypto";
import { waitForVisibleOutput } from "../environment/observe.mjs";

export const desktopOnly = true;

export async function run(environment) {
  const { page } = environment.states.desktop;
  const host = page.locator(".terminal-pane.active .terminal-host").first();
  await host.waitFor({ state: "visible", timeout: 30_000 });
  await environment.step(1, "passed");
  const observations = [], expected = [];
  for (const [index, prefix] of ["ALPHA", "BRAVO"].entries()) {
    const left = randomInt(200, 500), right = randomInt(200, 500);
    const result = `${prefix}${left + right}END`;
    // The expected output is absent from the echoed command line.
    const command = `printf '\\n${prefix}%sEND\\n' "$(( ${left} + ${right} ))"`;
    await host.click();
    await page.keyboard.insertText(command);
    await page.keyboard.press("Enter");
    observations.push(await waitForVisibleOutput(environment, result, `command-${index + 1}`));
    expected.push(result);
  }
  await environment.step(2, "passed");
  const lines = observations[1].text.split(/\r?\n/).map((line) => line.replace(/[ \t]/g, ""));
  if (lines.indexOf(expected[0]) < 0 || lines.indexOf(expected[1]) <= lines.indexOf(expected[0])) {
    throw new Error("The final terminal picture does not show both command outputs in submission order");
  }
  await environment.step(3, "passed");
  return { observations, expected };
}
