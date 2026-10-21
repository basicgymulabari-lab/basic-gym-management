import { loadEnv } from "vite";

const env = {
  ...loadEnv("production", process.cwd(), ""),
  ...process.env,
};
const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
const missing = required.filter((name) => {
  const value = env[name]?.trim();
  return !value || /your-project-id|your-publishable-key/i.test(value);
});

if (missing.length) {
  console.error(
    `Production deployment refused: configure ${missing.join(" and ")} in a local, untracked .env.production.local file or the build environment. See .env.example. Values are not printed.`,
  );
  process.exit(1);
}

let supabaseUrl;
try {
  supabaseUrl = new URL(env.VITE_SUPABASE_URL);
} catch {
  console.error("Production deployment refused: VITE_SUPABASE_URL must be a valid HTTPS URL.");
  process.exit(1);
}

if (supabaseUrl.protocol !== "https:") {
  console.error("Production deployment refused: VITE_SUPABASE_URL must use HTTPS.");
  process.exit(1);
}

console.log("Production authentication configuration is present (values hidden).");
