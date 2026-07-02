import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Apollo standalone server serves GraphQL at its root ("/").
// The client targets it via VITE_GRAPHQL_URL (see client/.env.example),
// defaulting to http://localhost:4000/ in development.
export default defineConfig({
  plugins: [react()],
  // allowedHosts lets ngrok/tunnel hosts reach the dev server (Vite blocks unknown
  // hosts by default). Safe for local dev; see docs/DEVELOPMENT.md § ngrok.
  server: { port: 5173, host: true, allowedHosts: [".ngrok-free.app", ".ngrok.app", ".ngrok.io", ".ngrok-free.dev"] },
});
