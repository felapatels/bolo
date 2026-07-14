// CLI entrypoint: `pnpm run seed`. All logic lives in seedContent.ts so the
// api-server can also run the same idempotent content seeding at startup.
import { seedContent } from "./seedContent";

seedContent()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
