import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Apollo standalone server serves GraphQL at its root ("/").
// The client targets it via VITE_GRAPHQL_URL (see client/.env.example),
// defaulting to http://localhost:4000/ in development.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
