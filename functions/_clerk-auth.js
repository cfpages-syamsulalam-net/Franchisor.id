import { createClerkClient, verifyToken } from "@clerk/backend";

const SITE_ID = "site_franchisor_id";
const SELF_ASSIGNABLE_ROLES = new Set(["franchisee", "franchisor"]);
const ADMIN_ROLE = "admin";
const STAFF_ROLE = "staff";

export class AuthError extends Error {
  constructor(message, status = 401, code = "AUTH_REQUIRED") {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

export async function requireD1User(request, env, db, options = {}) {
  const session = await authenticateClerkSession(request, env);
  const clerkUser = await getClerkUser(env, session.userId);
  const user = await upsertD1User(db, clerkUser);
  assertActiveD1User(user);

  if (SELF_ASSIGNABLE_ROLES.has(options.requestedRole)) {
    await ensureRole(db, user.id, options.requestedRole);
  }

  const roles = await getUserRoles(db, user.id);
  if (options.requiredRole && !hasRequiredRole(roles, options.requiredRole)) {
    throw new AuthError("Akun Anda tidak memiliki izin untuk aksi ini.", 403, "ROLE_FORBIDDEN");
  }

  await syncClerkMetadataFromD1(env, user, roles);

  return {
    ...user,
    clerk_user_id: session.userId,
    session_id: session.sessionId,
    roles,
    clerk_user: clerkUser,
  };
}

export async function requireD1UserFast(request, env, db, options = {}) {
  const session = await authenticateClerkSession(request, env);
  const user = await getD1UserByClerkId(db, session.userId);

  if (!user || user.status !== "active") {
    if (options.fallbackToFullSync !== false) {
      return requireD1User(request, env, db, options);
    }
    throw new AuthError("Sesi login belum tersinkron. Silakan muat ulang halaman.", 401, "AUTH_SYNC_REQUIRED");
  }

  const roles = await getUserRoles(db, user.id);
  if (options.requiredRole && !hasRequiredRole(roles, options.requiredRole)) {
    if (options.fallbackToFullSyncOnForbidden !== false) {
      return requireD1User(request, env, db, options);
    }
    throw new AuthError("Akun Anda tidak memiliki izin untuk aksi ini.", 403, "ROLE_FORBIDDEN");
  }

  return {
    ...user,
    clerk_user_id: session.userId,
    session_id: session.sessionId,
    roles,
    clerk_user: null,
    auth_mode: "d1_fast",
  };
}

export async function syncD1User(request, env, db, requestedRole) {
  const session = await authenticateClerkSession(request, env);
  const clerkUser = await getClerkUser(env, session.userId);
  const user = await upsertD1User(db, clerkUser);
  assertActiveD1User(user);

  if (SELF_ASSIGNABLE_ROLES.has(requestedRole)) {
    await ensureRole(db, user.id, requestedRole);
  }

  const roles = await getUserRoles(db, user.id);
  await syncClerkMetadataFromD1(env, user, roles);

  return {
    ...user,
    clerk_user_id: session.userId,
    session_id: session.sessionId,
    roles,
    clerk_user: clerkUser,
  };
}

export async function syncWebhookUserToD1(env, db, clerkUser) {
  const user = await upsertD1User(db, clerkUser);
  const roles = await getUserRoles(db, user.id);
  await syncClerkMetadataFromD1(env, user, roles);
  return { ...user, roles };
}

export async function markD1UserDeleted(db, clerkUserId) {
  await db
    .prepare(
      `UPDATE users
       SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
       WHERE clerk_user_id = ?`
    )
    .bind(clerkUserId)
    .run();
}

export async function assignD1Role(db, userId, role, actorUserId = null) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO user_roles (id, user_id, role, scope_type, scope_id, site_id, assigned_by_user_id)
       VALUES (?, ?, ?, 'network', 'network', ?, ?)`
    )
    .bind(`role_${randomId()}`, userId, role, SITE_ID, actorUserId)
    .run();
}

export async function removeD1Role(db, userId, role) {
  await db
    .prepare("DELETE FROM user_roles WHERE user_id = ? AND role = ? AND scope_type = 'network' AND scope_id = 'network'")
    .bind(userId, role)
    .run();
}

export async function getD1UserById(db, userId) {
  return db
    .prepare("SELECT id, clerk_user_id, primary_email, display_name, status FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first();
}

export async function getD1UserByClerkId(db, clerkUserId) {
  return db
    .prepare("SELECT id, clerk_user_id, primary_email, display_name, status FROM users WHERE clerk_user_id = ? LIMIT 1")
    .bind(clerkUserId)
    .first();
}

export async function getAllD1Users(db, limit = 500) {
  const result = await db
    .prepare("SELECT id, clerk_user_id, primary_email, display_name, status FROM users WHERE clerk_user_id IS NOT NULL ORDER BY updated_at DESC LIMIT ?")
    .bind(limit)
    .all();
  return result.results || [];
}

export async function syncClerkMetadataForD1User(env, db, user) {
  const roles = await getUserRoles(db, user.id);
  await syncClerkMetadataFromD1(env, user, roles);
  return { ...user, roles };
}

export function authErrorResponse(error) {
  if (!(error instanceof AuthError)) return null;
  return new Response(
    JSON.stringify({
      success: false,
      error: error.code,
      message: error.message,
    }),
    {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function authenticateClerkSession(request, env) {
  if (!env.CLERK_SECRET_KEY) {
    throw new AuthError("CLERK_SECRET_KEY belum dikonfigurasi di Cloudflare Pages.", 503, "CLERK_SECRET_MISSING");
  }

  const token = getBearerToken(request);
  if (!token) {
    throw new AuthError("Silakan login terlebih dahulu untuk menyimpan data.", 401, "AUTH_REQUIRED");
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      authorizedParties: parseAuthorizedParties(env.CLERK_AUTHORIZED_PARTIES),
    });

    if (!payload?.sub) {
      throw new AuthError("Sesi login tidak valid.", 401, "INVALID_SESSION");
    }

    return {
      userId: payload.sub,
      sessionId: payload.sid || null,
      claims: payload,
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError("Sesi login tidak valid atau sudah kedaluwarsa.", 401, "INVALID_SESSION");
  }
}

export async function getClerkUser(env, clerkUserId) {
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  return clerk.users.getUser(clerkUserId);
}

export async function syncClerkMetadataFromD1(env, user, roles) {
  if (!env.CLERK_SECRET_KEY || !user?.clerk_user_id) return;

  const roleNames = [...new Set((roles || []).map((row) => row.role).filter(Boolean))].sort();
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

  await clerk.users.updateUserMetadata(user.clerk_user_id, {
    publicMetadata: {
      franchiseNetwork: {
        d1UserId: user.id,
        roles: roleNames,
        status: user.status || "active",
        syncedAt: new Date().toISOString(),
      },
    },
    privateMetadata: {
      franchiseNetwork: {
        d1UserId: user.id,
        roles: roleNames,
        status: user.status || "active",
        source: "d1",
        syncedAt: new Date().toISOString(),
      },
    },
  });
}

// Identity resolution must never write `status`. Whichever site a person signs in through, an account that is
// suspended or deleted stays that way. An earlier revision of this file forced `status = 'active'` on both
// existing-row paths, which let a suspended user reinstate themselves, roles and email grants included, simply
// by signing in here. The suspension decision belongs to an administrator, not to a successful login.
export async function upsertD1User(db, clerkUser) {
  const primaryEmail = getPrimaryEmail(clerkUser);
  const displayName = getDisplayName(clerkUser, primaryEmail);
  const existing = await db
    .prepare("SELECT id, primary_email, display_name, status FROM users WHERE clerk_user_id = ? LIMIT 1")
    .bind(clerkUser.id)
    .first();

  if (existing) {
    await db
      .prepare(
        `UPDATE users
         SET primary_email = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(primaryEmail, displayName, existing.id)
      .run();

    const user = {
      id: existing.id,
      clerk_user_id: clerkUser.id,
      primary_email: primaryEmail,
      display_name: displayName,
      status: existing.status || "active",
    };
    if (user.status === "active") await applyEmailRoleGrants(db, user);
    return user;
  }

  const existingByEmail = primaryEmail && isPrimaryEmailVerified(clerkUser)
    ? await db
        .prepare("SELECT id, clerk_user_id, primary_email, display_name, status FROM users WHERE lower(primary_email) = ? LIMIT 1")
        .bind(normalizeEmail(primaryEmail))
        .first()
    : null;

  if (existingByEmail) {
    await db
      .prepare(
        `UPDATE users
         SET clerk_user_id = ?, primary_email = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(clerkUser.id, primaryEmail, displayName, existingByEmail.id)
      .run();

    const user = {
      id: existingByEmail.id,
      clerk_user_id: clerkUser.id,
      primary_email: primaryEmail,
      display_name: displayName,
      status: existingByEmail.status || "active",
    };
    if (user.status === "active") await applyEmailRoleGrants(db, user);
    return user;
  }

  const userId = `user_${randomId()}`;
  await db
    .prepare(
      `INSERT INTO users (id, clerk_user_id, primary_email, display_name, status)
       VALUES (?, ?, ?, ?, 'active')`
    )
    .bind(userId, clerkUser.id, primaryEmail, displayName)
    .run();

  const user = {
    id: userId,
    clerk_user_id: clerkUser.id,
    primary_email: primaryEmail,
    display_name: displayName,
    status: "active",
  };
  await applyEmailRoleGrants(db, user);
  return user;
}

// Preserving `status` in upsertD1User is not enough on its own: without this guard a suspended or deleted
// account still passes every authenticated path, because nothing else inspects the status. Franchisee.id has
// both the guard and its two call sites; this copy was missing all three, which meant a suspended account
// could keep acting here. Keep this function and its call sites in step with the sibling repository — the
// resolver parity check compares the exported surface and fails if they diverge.
export function assertActiveD1User(user) {
  if (user?.status !== "active") {
    throw new AuthError("Akun Anda tidak aktif.", 403, "ACCOUNT_INACTIVE");
  }
}

async function ensureRole(db, userId, role) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO user_roles (id, user_id, role, scope_type, scope_id, site_id)
       VALUES (?, ?, ?, 'network', 'network', ?)`
    )
    .bind(`role_${randomId()}`, userId, role, SITE_ID)
    .run();
}

async function applyEmailRoleGrants(db, user) {
  const email = normalizeEmail(user.primary_email);
  if (!email) return;

  const result = await db
    .prepare(
      `SELECT id, role, scope_type, scope_id, site_id
       FROM email_role_grants
       WHERE email_normalized = ? AND is_active = 1`
    )
    .bind(email)
    .all();

  const grants = result.results || [];
  for (const grant of grants) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO user_roles (id, user_id, role, scope_type, scope_id, site_id, assigned_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(`role_${randomId()}`, user.id, grant.role, grant.scope_type || "network", grant.scope_id || "network", grant.site_id || SITE_ID, grant.granted_by_user_id || null)
      .run();

    await db
      .prepare(
        `UPDATE email_role_grants
         SET applied_user_id = ?, applied_at = COALESCE(applied_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(user.id, grant.id)
      .run();
  }
}

async function getUserRoles(db, userId) {
  const result = await db
    .prepare("SELECT role, scope_type, scope_id, site_id FROM user_roles WHERE user_id = ?")
    .bind(userId)
    .all();
  return result.results || [];
}

function hasRequiredRole(roles, requiredRole) {
  const roleNames = new Set(roles.map((row) => row.role));
  return roleNames.has(requiredRole) || roleNames.has(ADMIN_ROLE) || (requiredRole === STAFF_ROLE && roleNames.has(STAFF_ROLE));
}

function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function parseAuthorizedParties(value) {
  const parties = (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parties.length ? parties : undefined;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getPrimaryEmail(clerkUser) {
  const addresses = clerkUser.emailAddresses || clerkUser.email_addresses || [];
  const primaryId = clerkUser.primaryEmailAddressId || clerkUser.primary_email_address_id;
  const primary = addresses.find((item) => item.id === primaryId);
  return primary?.emailAddress || primary?.email_address || addresses[0]?.emailAddress || addresses[0]?.email_address || null;
}

function isPrimaryEmailVerified(clerkUser) {
  const addresses = clerkUser.emailAddresses || clerkUser.email_addresses || [];
  const primaryId = clerkUser.primaryEmailAddressId || clerkUser.primary_email_address_id;
  const primary = addresses.find((item) => item.id === primaryId) || addresses[0];
  const status = primary?.verification?.status || primary?.verification_status || primary?.status;
  return status === "verified";
}

function getDisplayName(clerkUser, primaryEmail) {
  const firstName = clerkUser.firstName || clerkUser.first_name;
  const lastName = clerkUser.lastName || clerkUser.last_name;
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || clerkUser.username || primaryEmail || clerkUser.id;
}

function randomId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
