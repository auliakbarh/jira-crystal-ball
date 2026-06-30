import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";
import { buildContext } from "./context.js";
import { env } from "./env.js";
import { prisma } from "./db.js";

const server = new ApolloServer({ typeDefs, resolvers });

const { url } = await startStandaloneServer(server, {
  listen: { port: env.port },
  context: async ({ req }) => buildContext({ req: { headers: req.headers as any } }),
});

console.log(`🔮 JIRA Crystal Ball GraphQL ready at ${url}`);

// Graceful shutdown so `tsx watch` reloads (and Ctrl+C) exit promptly instead
// of being force-killed after 5s — closes the HTTP server and the DB pool.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await server.stop();
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void shutdown(sig));
}
