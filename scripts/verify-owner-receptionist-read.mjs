import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const clientSource = readFileSync("src/lib/gym/cloud.ts", "utf8");
const edgeSource = readFileSync("supabase/functions/staff-receptionist/index.ts", "utf8");

const readClient = clientSource.match(/async function ownerReceptionist\(\)[\s\S]*?\r?\n}\r?\n/);
assert.ok(readClient, "owner receptionist loader should remain present");
assert.match(readClient[0], /invokeEdgeFunction[\s\S]*?"staff-receptionist"/);
assert.match(readClient[0], /body:\s*\{\s*action:\s*"read"\s*\}/);
assert.doesNotMatch(readClient[0], /\.from\(["']gym_users["']\)/);

const ownerCheck = edgeSource.indexOf("await requireOwner(request)");
const readAction = edgeSource.indexOf('if (body.action === "read")');
const readQueryEnd = edgeSource.indexOf("const { data: gym, error: gymStatusError }", readAction);
assert.ok(ownerCheck >= 0 && readAction > ownerCheck, "read action must require owner authorization first");
assert.ok(readQueryEnd > readAction, "read action should return before update-only checks");

const readBranch = edgeSource.slice(readAction, readQueryEnd);
assert.match(readBranch, /consumeRateLimit\("staff:receptionist-read", owner\.id/);
assert.match(readBranch, /\.select\("display_name,email,enabled,permissions"\)/);
assert.match(readBranch, /\.eq\("gym_id", membership\.gym_id\)/);
assert.match(readBranch, /\.eq\("role", "receptionist"\)/);
assert.doesNotMatch(readBranch, /request\.json|body\.gym_id|body\.user_id/);
assert.match(readBranch, /permissions:\s*normalizePermissions\(receptionist\.permissions\)/);

console.log("Owner receptionist read-path checks passed (owner-only, tenant-scoped, rate-limited, minimal fields).");
