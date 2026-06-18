import { defineConfig } from "drizzle-kit";
import path from "path";

const dbPath = path.resolve(process.env.DB_PATH ?? "./data/mikailab.db");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
