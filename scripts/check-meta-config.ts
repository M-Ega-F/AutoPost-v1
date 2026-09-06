import { config } from "dotenv";

import { serverConfig } from "@/lib/env";

config({ path: ".env.local" });
config();

const { clientId, clientSecret } = serverConfig.meta;

console.log(`META_CLIENT_ID configured: ${clientId ? "yes" : "no"}`);
console.log(`META_CLIENT_SECRET configured: ${clientSecret ? "yes" : "no"}`);
