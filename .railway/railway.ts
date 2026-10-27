import { defineRailway, github, preserve, project, service } from "railway/iac";

// This file manages only the server service; the Postgres database is left to Railway.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "server";

export default defineRailway(() => {
  const server = service("server", {
    source: github("anirudh-naveen/veiled_chess", { branch: "main" }),
    // Values live in Railway (DATABASE_URL references the Postgres service), so secrets stay out of the repo.
    env: {
      DATABASE_URL: preserve(),
      JWT_SECRET: preserve(),
      CLIENT_ORIGIN: preserve(),
    },
    // Built from the repository root so the shared package is in the build context.
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "server/Dockerfile",
      watchPatterns: ["server/**", "shared/**", "package-lock.json", ".railway/**"],
    },
    deploy: {
      healthcheckPath: "/health",
      healthcheckTimeout: 60,
      // Restart policy is Railway's default (on failure); setting it explicitly shows as permanent drift.
      restartPolicyMaxRetries: 5,
    },
  });
  return project("spy-chess", {
    resources: [server],
  });
});
