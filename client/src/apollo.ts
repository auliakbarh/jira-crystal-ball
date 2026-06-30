import { ApolloClient, InMemoryCache, createHttpLink, split } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";

const HTTP_URL = import.meta.env.VITE_GRAPHQL_URL || "http://localhost:4000/graphql";
const WS_URL = HTTP_URL.replace(/^http/, "ws");

const httpLink = createHttpLink({ uri: HTTP_URL });

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem("jcb_token");
  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

// WebSocket link for subscriptions; sends the token via connectionParams.
const wsLink = new GraphQLWsLink(
  createClient({
    url: WS_URL,
    connectionParams: () => {
      const token = localStorage.getItem("jcb_token");
      return token ? { authorization: `Bearer ${token}` } : {};
    },
    retryAttempts: Infinity,
  }),
);

// Route subscriptions over WS, everything else over HTTP.
const link = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === "OperationDefinition" && def.operation === "subscription";
  },
  wsLink,
  authLink.concat(httpLink),
);

export const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: "cache-and-network" },
  },
});
