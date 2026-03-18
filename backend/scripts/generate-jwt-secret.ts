/**
 * Generates a secure random secret for signing JWTs.
 * Usage:
 *   bun scripts/generate-jwt-secret.ts
 *   node -r dotenv/config scripts/generate-jwt-secret.ts
 */

import { randomBytes } from "crypto";

const secret = randomBytes(64).toString("hex");
console.log(secret);