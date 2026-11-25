// Shared setup for tests of the Items page: the app has no API that deletes items, so the
// items table is emptied in the database container of the docker compose project.
import { execFileSync } from "child_process";

const composeProject = process.env.COMPOSE_PROJECT_NAME || "e2ewebapp";

function dbContainerId(): string {
  const out = execFileSync(
    "docker",
    [
      "ps",
      "--filter", `label=com.docker.compose.project=${composeProject}`,
      "--filter", "label=com.docker.compose.service=db",
      "-q",
    ],
    { encoding: "utf8" },
  ).trim();
  const id = out.split("\n")[0];
  if (!id) throw new Error(`no running db container for compose project ${composeProject}`);
  return id;
}

/** Removes every item and restarts the id sequence, as `TRUNCATE items RESTART IDENTITY`. */
export function emptyItemsTable(): void {
  execFileSync("docker", ["exec", dbContainerId(), "psql", "-U", "app", "-d", "app", "-c", "TRUNCATE items RESTART IDENTITY"], {
    stdio: "pipe",
  });
}
