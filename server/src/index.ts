import { createServer } from "http";
import express from "express";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/use/ws";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";
import { buildContext, contextFromAuthHeader } from "./context.js";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { startScheduler } from "./scheduler.js";

const schema = makeExecutableSchema({ typeDefs, resolvers });

const app = express();
const httpServer = createServer(app);

// WebSocket server for GraphQL subscriptions at the same path ("/graphql").
const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" });
const wsCleanup = useServer(
  {
    schema,
    // Auth via connectionParams.authorization sent by the client on connect.
    context: (ctx) => {
      const params = (ctx.connectionParams ?? {}) as Record<string, unknown>;
      const header = (params.authorization || params.Authorization) as string | undefined;
      return contextFromAuthHeader(header);
    },
  },
  wsServer,
);

const server = new ApolloServer({
  schema,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await wsCleanup.dispose();
          },
        };
      },
    },
  ],
});

await server.start();

const gqlMiddleware = expressMiddleware(server, {
  context: async ({ req }) => buildContext({ req: { headers: req.headers as any } }),
});
// Serve GraphQL at /graphql and at / (root) for backward compatibility.
app.use(["/graphql", "/"], cors<cors.CorsRequest>(), express.json({ limit: "2mb" }), gqlMiddleware);

async function shutdown() {
  await server.stop();
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
}
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => void shutdown());

httpServer.listen(env.port, () => {
  console.log(`🔮 JIRA Crystal Ball GraphQL ready at http://localhost:${env.port}/graphql`);
  console.log(`   Subscriptions (WebSocket) at ws://localhost:${env.port}/graphql`);
  startScheduler();
});
