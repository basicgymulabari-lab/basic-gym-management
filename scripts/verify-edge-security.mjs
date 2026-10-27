import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { HttpError, corsHeaders, parseJson, readLimitedBodyText } =
  await import("../supabase/functions/_shared/http.ts");
const { addCspNonces } = await import("../src/lib/security/csp.ts");
const { stripeRefundEntries } = await import("../supabase/functions/_shared/stripe-refunds.ts");
const { buildChartCss } = await import("../src/lib/security/chart-css.ts");

const billingSource = await readFile(
  new URL("../supabase/functions/_shared/billing.ts", import.meta.url),
  "utf8",
);
const stripeWebhookSource = await readFile(
  new URL("../supabase/functions/stripe-webhook/index.ts", import.meta.url),
  "utf8",
);
const razorpayWebhookSource = await readFile(
  new URL("../supabase/functions/razorpay-webhook/index.ts", import.meta.url),
  "utf8",
);
const auditPermissionMigration = await readFile(
  new URL(
    "../supabase/migrations/20261018130000_harden_tenant_audit_event_permissions.sql",
    import.meta.url,
  ),
  "utf8",
);
const membershipPlanValidationMigration = await readFile(
  new URL(
    "../supabase/migrations/20261019100000_validate_membership_plan_data.sql",
    import.meta.url,
  ),
  "utf8",
);
const internalApiPrivilegesMigration = await readFile(
  new URL(
    "../supabase/migrations/20261026100000_revoke_internal_api_privileges.sql",
    import.meta.url,
  ),
  "utf8",
);
const internalApiPrivilegesAssertions = await readFile(
  new URL("../supabase/tests/internal_api_privileges.sql", import.meta.url),
  "utf8",
);
const tenantIsolationTests = await readFile(
  new URL("../supabase/tests/tenant_isolation.sql", import.meta.url),
  "utf8",
);
const tenantIsolationAssertionTests = await readFile(
  new URL("../supabase/tests/tenant_isolation_assert.sql", import.meta.url),
  "utf8",
);
assert.deepEqual(
  stripeRefundEntries({
    amount_refunded: 1500,
    refunds: {
      data: [
        { id: "re_first", amount: 500 },
        { id: "re_second", amount: 1000 },
      ],
    },
  }),
  [
    { id: "re_first", amount: 500 },
    { id: "re_second", amount: 1000 },
  ],
  "Stripe charge refunds must preserve each partial refund instead of recording only the first",
);
assert.deepEqual(
  stripeRefundEntries({ amount_refunded: 700, created: 123 }),
  [{ amount: 700, created: 123 }],
  "Stripe charge aggregate remains a fallback when refund detail is absent",
);
assert.deepEqual(
  stripeRefundEntries({ amount_refunded: 0, refunds: { data: [] } }),
  [],
  "charges without refunds must not create refund rows",
);
const chartCss = buildChartCss("chart-safe", {
  revenue: { color: "oklch(0.7 0.2 80)" },
  maliciousKey: { color: "red}</style><script>alert(1)</script>" },
  "bad];script": { color: "red" },
  injectedColor: { color: "red; background: url(https://attacker.invalid/collect)" },
});
assert.match(chartCss, /--color-revenue: oklch\(0\.7 0\.2 80\);/);
assert.doesNotMatch(chartCss, /<script|attacker\.invalid|--color-maliciousKey|bad\];script/);
assert.equal(
  buildChartCss("chart-safe] <script>alert(1)</script>", { revenue: { color: "red" } }),
  "",
  "chart CSS selectors must reject HTML/CSS-injected identifiers",
);
for (const signature of [
  "public.iv_validate_workspace(jsonb)",
  "public.iv_validate_private_asset_references(jsonb)",
  "public.iv_validate_private_assets_trigger()",
  "public.normalize_subscription_entitlement()",
  "public.set_updated_at()",
]) {
  assert.ok(
    internalApiPrivilegesMigration.includes(`on function ${signature}`),
    `internal helper ${signature} must have explicit API execute revocation`,
  );
}
assert.match(
  internalApiPrivilegesMigration,
  /revoke all on table public\.audit_logs, public\.gym_users, public\.gyms,[\s\S]*?from anon;/,
  "anonymous access to sensitive gym metadata tables must be revoked",
);
assert.match(
  internalApiPrivilegesMigration,
  /revoke maintain on table public\.audit_logs, public\.gym_users, public\.gyms,[\s\S]*?from anon, authenticated;/,
  "API roles must not receive database maintenance privileges on gym metadata tables",
);
assert.ok(
  internalApiPrivilegesAssertions.includes("has_function_privilege('service_role', v_function, 'EXECUTE')") &&
    internalApiPrivilegesAssertions.includes("has_table_privilege('anon', v_table, 'REFERENCES')") &&
    internalApiPrivilegesAssertions.includes("has_table_privilege('anon', v_table, 'TRIGGER')") &&
    internalApiPrivilegesAssertions.includes("has_table_privilege('authenticated', v_table, 'MAINTAIN')") &&
    internalApiPrivilegesAssertions.includes("has_table_privilege('service_role', v_table, 'DELETE')") &&
    internalApiPrivilegesAssertions.includes("relrowsecurity"),
  "SQL regression assertions must cover internal service-role grants, trusted service-role CRUD, all anonymous table grants, authenticated MAINTAIN, and RLS state",
);
assert.ok(
  stripeWebhookSource.includes('typeof object.payment_intent === "string"'),
  "Stripe refund matching must fall back to the PaymentIntent identifier",
);
assert.ok(
  stripeWebhookSource.includes("paymentId: existing.provider_payment_id"),
  "refund rows must use the payment identifier of their matched source transaction",
);
assert.ok(
  stripeWebhookSource.includes("if (!existingRefundIds.has(refundId))"),
  "repeated charge snapshots must not duplicate refund audit events",
);
assert.match(
  billingSource,
  /if \(error\)\s*\{\s*throw new HttpError\("Could not record the billing transaction\.", 502, "BILLING_TRANSACTION_UPDATE_FAILED"\);/,
  "billing transaction write failures must propagate so webhooks are retried",
);
assert.match(
  billingSource,
  /if \(error\)\s*\{\s*throw new HttpError\("Could not verify the subscription owner\.", 502, "ENTITLEMENT_LOOKUP_FAILED"\);/,
  "subscription lookup failures must not be mistaken for unknown subscriptions",
);
for (const [provider, source] of [
  ["Stripe", stripeWebhookSource],
  ["Razorpay", razorpayWebhookSource],
]) {
  assert.match(
    source,
    /if \(lookupError\)\s*\{\s*throw new HttpError\(\s*"Could not find the billing transaction to refund\.",\s*502,\s*"BILLING_TRANSACTION_LOOKUP_FAILED",\s*\);/,
    `${provider} refund lookup failures must propagate for provider retry`,
  );
}
assert.match(
  auditPermissionMigration,
  /p_action in \('settings_updated', 'backup_restored', 'staff_updated'\)\s+then\s+v_allowed := v_membership\.role = 'owner'/,
  "owner-sensitive audit events must reject receptionist accounts",
);
assert.match(
  auditPermissionMigration,
  /'attendance_checked_in', 'attendance_deleted'[\s\S]*?iv_has_permission\(v_membership\.permissions, 'members'\)/,
  "attendance audit events must require the members permission for staff",
);
assert.match(
  auditPermissionMigration,
  /v_asset_gym_id = v_membership\.gym_id::text[\s\S]*?AUDIT_ACTION_FORBIDDEN/,
  "private-asset audit events must remain inside the caller's gym",
);
assert.match(
  membershipPlanValidationMigration,
  /perform public\.iv_validate_membership_plans\(new\.state\)/,
  "workspace writes must validate membership plan data inside the database trigger",
);
assert.ok(
  membershipPlanValidationMigration.includes(
    "jsonb_typeof(plan -> 'name') is distinct from 'string'",
  ) &&
    membershipPlanValidationMigration.includes("round((plan ->> 'price')::numeric * 100) <= 0") &&
    membershipPlanValidationMigration.includes(
      "round((plan ->> 'joiningFee')::numeric * 100) < 0",
    ) &&
    membershipPlanValidationMigration.includes("durationDays"),
  "membership plan validation must bound price, joining fees, and duration",
);
assert.match(
  tenantIsolationTests,
  /INVALID_PLAN_DATA[\s\S]*?receptionists cannot persist invalid membership plan prices/,
  "tenant SQL regression tests must cover invalid plan prices submitted by receptionists",
);
assert.ok(
  [
    "owner A cannot read Gym B through the gyms table",
    "owner A cannot read Gym B memberships through the gym_users table",
    "owner A cannot read Gym B subscription through the table",
    "owner A cannot read Gym B audit entries through the table",
    "owner A cannot update Gym B through direct table access",
    "owner A cannot delete Gym B memberships through direct table access",
    "owner A workspace RPC saves only the tenant resolved from auth.uid()",
    "owner B remains isolated after owner A saves a workspace",
  ].every((assertion) => tenantIsolationTests.includes(assertion)) &&
    tenantIsolationTests.includes("authenticated clients cannot directly execute the private-asset validator") &&
    tenantIsolationTests.includes("workspace trigger still rejects inline member photos") &&
    tenantIsolationAssertionTests.includes("perform public.save_current_gym_workspace") &&
    !tenantIsolationAssertionTests.includes("perform public.iv_validate_private_asset_references"),
  "tenant regression tests must cover cross-gym direct access, tenant-bound RPC writes, and private helper access through supported workflow only",
);
const plannedSqlAssertions = Number(tenantIsolationTests.match(/select plan\((\d+)\);/)?.[1]);
const actualSqlAssertions = [
  ...tenantIsolationTests.matchAll(/^select (?:throws_ok|is\(|isnt\(|ok\(|lives_ok\()/gm),
].length;
assert.equal(
  plannedSqlAssertions,
  actualSqlAssertions,
  "tenant isolation pgTAP plan must match its assertion count",
);

const testEnvironment = new Map([
  ["APP_ORIGIN", "https://ironvault-gym.pages.dev"],
  ["EXTRA_ALLOWED_ORIGINS", "https://preview.ironvault-gym.pages.dev,http://localhost:5173"],
]);
globalThis.Deno = { env: { get: (name) => testEnvironment.get(name) ?? undefined } };

function corsFor(origin) {
  return corsHeaders(new Request("https://edge.invalid/test", { headers: { origin } }));
}

assert.equal(
  corsFor("https://ironvault-gym.pages.dev")["Access-Control-Allow-Origin"],
  "https://ironvault-gym.pages.dev",
);
assert.equal(
  corsFor("https://preview.ironvault-gym.pages.dev")["Access-Control-Allow-Origin"],
  "https://preview.ironvault-gym.pages.dev",
);
assert.equal(
  corsFor("http://localhost:5173")["Access-Control-Allow-Origin"],
  "http://localhost:5173",
  "development origins remain available when explicitly configured",
);
assert.equal(
  corsFor("http://localhost:9999")["Access-Control-Allow-Origin"],
  "https://ironvault-gym.pages.dev",
  "unconfigured localhost ports must not be trusted",
);
assert.equal(
  corsFor("https://attacker.invalid")["Access-Control-Allow-Origin"],
  "https://ironvault-gym.pages.dev",
  "untrusted origins must not be echoed",
);

const originalCsp =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; style-src 'self'; style-src-attr 'unsafe-inline'";
const nonceCsp = addCspNonces(originalCsp, "MTIzNDU2Nzg5MDEyMzQ1Njc4");
assert.ok(nonceCsp);
assert.match(
  nonceCsp,
  /script-src 'self' https:\/\/checkout\.razorpay\.com 'nonce-MTIzNDU2Nzg5MDEyMzQ1Njc4'/,
);
assert.doesNotMatch(nonceCsp, /script-src[^;]*'unsafe-inline'/);
assert.match(nonceCsp, /style-src 'self' 'nonce-MTIzNDU2Nzg5MDEyMzQ1Njc4'/);
assert.match(nonceCsp, /style-src-attr 'unsafe-inline'/);
assert.equal(addCspNonces(originalCsp, "nonce;inject"), null);
assert.equal(
  addCspNonces("default-src 'self'; script-src 'self'", "MTIzNDU2Nzg5MDEyMzQ1Njc4"),
  null,
);

function streamingRequest(chunks, headers = {}) {
  let index = 0;
  let canceled = false;
  const body = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(new TextEncoder().encode(chunks[index++]));
      } else {
        controller.close();
      }
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request("https://edge.invalid/test", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  });
  return { request, wasCanceled: () => canceled };
}

const valid = streamingRequest(['{"name":"Nabin"}'], {
  "content-type": "application/json",
});
assert.deepEqual(await parseJson(valid.request), { name: "Nabin" });

const withinLimit = streamingRequest(["1234"]);
assert.equal(await readLimitedBodyText(withinLimit.request, 4), "1234");

const streamedTooLarge = streamingRequest(["12345", "ignored"]);
await assert.rejects(readLimitedBodyText(streamedTooLarge.request, 4), (error) => {
  assert.ok(error instanceof HttpError);
  assert.equal(error.status, 413);
  assert.equal(error.code, "PAYLOAD_TOO_LARGE");
  return true;
});
assert.equal(streamedTooLarge.wasCanceled(), true, "oversized streams should be canceled early");

const declaredTooLarge = streamingRequest(["{}"], {
  "content-type": "application/json",
  "content-length": "1048577",
});
await assert.rejects(parseJson(declaredTooLarge.request), (error) => {
  assert.ok(error instanceof HttpError);
  assert.equal(error.status, 413);
  assert.equal(error.code, "PAYLOAD_TOO_LARGE");
  return true;
});

const invalidJson = streamingRequest(["{"], { "content-type": "application/json" });
await assert.rejects(parseJson(invalidJson.request), (error) => {
  assert.ok(error instanceof HttpError);
  assert.equal(error.status, 400);
  assert.equal(error.code, "INVALID_JSON");
  return true;
});

const nonJson = streamingRequest(["{}"], { "content-type": "text/plain" });
await assert.rejects(parseJson(nonJson.request), (error) => {
  assert.ok(error instanceof HttpError);
  assert.equal(error.status, 415);
  assert.equal(error.code, "UNSUPPORTED_MEDIA_TYPE");
  return true;
});

console.log(
  "Security checks passed (bounded requests, safe errors, webhook persistence, multi-refund handling, and authorization contracts).",
);
