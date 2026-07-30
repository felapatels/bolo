// Real needs_client_trust flow probe (build-27 pre-ship verification, July 30 2026).
// Requires: Clerk DEV instance with Client Trust ON. Uses BAPI to mint a throwaway
// +clerk_test user, then drives FAPI as a FRESH client (= new device):
//   password first factor -> needs_client_trust -> email_code second factor (424242) -> complete.
// Env: CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY. Never prints secrets.
const SK = process.env.CLERK_SECRET_KEY;
const PK = process.env.CLERK_PUBLISHABLE_KEY;
if (!SK || !PK) throw new Error("missing Clerk env");
const fapiHost = Buffer.from(PK.split("_")[2] ?? PK.replace(/^pk_(test|live)_/, ""), "base64")
  .toString("utf8")
  .replace(/\$$/, "");
const FAPI = `https://${fapiHost}/v1`;
console.log("FAPI host:", fapiHost);

const email = `bolo-b27-trust+clerk_test@example.com`;
const password = `B27!trust-${Math.random().toString(36).slice(2)}Xy`;

const bapi = async (method, path, body) => {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  return { status: r.status, j };
};

// -- cleanup any leftover user from a previous run, then create fresh
const found = await bapi("GET", `/users?email_address=${encodeURIComponent(email)}`);
for (const u of Array.isArray(found.j) ? found.j : []) {
  console.log("deleting leftover user", u.id);
  await bapi("DELETE", `/users/${u.id}`);
}
const created = await bapi("POST", "/users", {
  email_address: [email],
  password,
  skip_password_checks: true,
});
if (created.status !== 200) {
  console.error("BAPI create user failed:", created.status, JSON.stringify(created.j));
  process.exit(1);
}
const userId = created.j.id;
console.log("created test user:", userId);

let clientAuth = null; // fresh client == new device
const fapi = async (method, path, form) => {
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (clientAuth) headers.Authorization = clientAuth;
  const r = await fetch(`${FAPI}${path}${path.includes("?") ? "&" : "?"}_is_native=1`, {
    method,
    headers,
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const auth = r.headers.get("authorization");
  if (auth) clientAuth = auth;
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
};

const show = (label, resp) => {
  const s = resp.j?.response ?? resp.j;
  console.log(`\n== ${label} -> HTTP ${resp.status}`);
  console.log(
    JSON.stringify(
      {
        status: s?.status,
        supported_first_factors: s?.supported_first_factors?.map((f) => f.strategy),
        supported_second_factors: s?.supported_second_factors?.map((f) => f.strategy),
        created_session_id: s?.created_session_id,
        errors: resp.j?.errors?.map((e) => ({ code: e.code, message: e.message, long: e.long_message })),
      },
      null,
      2,
    ),
  );
  return s;
};

let pass = true;
try {
  const si = await fapi("POST", "/client/sign_ins", { identifier: email });
  const s1 = show("create sign_in", si);
  const signInId = s1?.id;
  if (!signInId) throw new Error("no sign_in id");

  const first = await fapi("POST", `/client/sign_ins/${signInId}/attempt_first_factor`, {
    strategy: "password",
    password,
  });
  const s2 = show("attempt_first_factor(password)", first);
  if (s2?.status !== "needs_client_trust") {
    pass = false;
    console.error(`DEVIATION: expected status needs_client_trust, got ${s2?.status}`);
  }

  // signIn.mfa.sendEmailCode() equivalent
  const emailFactor = (s2?.supported_second_factors ?? []).find((f) => f.strategy === "email_code");
  const prep = await fapi("POST", `/client/sign_ins/${signInId}/prepare_second_factor`, {
    strategy: "email_code",
    ...(emailFactor?.email_address_id ? { email_address_id: emailFactor.email_address_id } : {}),
  });
  const s3 = show("prepare_second_factor(email_code) [mfa.sendEmailCode]", prep);
  if (prep.status >= 400) {
    pass = false;
    console.error("DEVIATION: prepare_second_factor failed");
  }

  // signIn.mfa.verifyEmailCode({code}) equivalent
  const att = await fapi("POST", `/client/sign_ins/${signInId}/attempt_second_factor`, {
    strategy: "email_code",
    code: "424242",
  });
  const s4 = show("attempt_second_factor(424242) [mfa.verifyEmailCode]", att);
  if (s4?.status !== "complete" || !s4?.created_session_id) {
    pass = false;
    console.error("DEVIATION: expected complete + created_session_id");
  } else {
    console.log("\nsession activated:", s4.created_session_id);
  }
} finally {
  const del = await bapi("DELETE", `/users/${userId}`);
  console.log("\ncleanup user delete:", del.status);
}
console.log(pass ? "\nRESULT: PASS" : "\nRESULT: FAIL");
process.exit(pass ? 0 : 1);
