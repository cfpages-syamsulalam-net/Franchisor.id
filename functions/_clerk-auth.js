import { createClerkClient, verifyToken } from "@clerk/backend";
import { logOperationEvent } from "./_telemetry.js";

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
  const user = await upsertD1User(db, clerkUser, { appKey: env.CLERK_APP_KEY, blockSalt: env.USER_BLOCK_SALT });
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
  const user = await upsertD1User(db, clerkUser, { appKey: env.CLERK_APP_KEY, blockSalt: env.USER_BLOCK_SALT });
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
  const user = await upsertD1User(db, clerkUser, { appKey: env.CLERK_APP_KEY, blockSalt: env.USER_BLOCK_SALT });
  const roles = await getUserRoles(db, user.id);
  // Webhooks are inbound only: metadata writes emit another user.updated webhook, so calling
  // `syncClerkMetadataFromD1` here fed the webhook back into itself. The sibling copy never had that call.
  return { ...user, roles };
}

export async function markD1UserDeleted(db, clerkUserId) {
  const identity = await db
    .prepare(
      `SELECT id, user_id FROM user_identities
       WHERE provider = 'clerk' AND clerk_user_id = ? AND revoked_at IS NULL
       LIMIT 1`
    )
    .bind(clerkUserId)
    .first();

  if (!identity) {
    // Row predates user_identities: nothing to revoke, so keep the original behaviour.
    await db
      .prepare("UPDATE users SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE clerk_user_id = ?")
      .bind(clerkUserId)
      .run();
    return;
  }

  await revokeIdentity(db, identity.id, "Clerk account deleted");

  // Retire the shared user only when no live identity remains. Deleting the account in one Clerk application
  // must not delete the person for the other site.
  const remaining = await db
    .prepare("SELECT COUNT(*) AS n FROM user_identities WHERE user_id = ? AND revoked_at IS NULL")
    .bind(identity.user_id)
    .first();

  if (!remaining || remaining.n === 0) {
    await db
      .prepare("UPDATE users SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(identity.user_id)
      .run();
    // The status timeline carries access states (active/pending/suspended/blocked), not `users.status` values
    // verbatim — erasure is expressed by `user_blocks`. So a removal is recorded as losing access, with the
    // precise `users.status` named in the reason rather than silently reinterpreted.
    await recordUserStatusEvent(
      db,
      identity.user_id,
      "suspended",
      "every Clerk identity was deleted (users.status set to deleted)"
    );
  }
}

/**
 * Links a Clerk identity to a D1 user.
 *
 * `ON CONFLICT` revives a previously revoked identity instead of ignoring it, which makes an unlink
 * reversible: revoking means "stop trusting this identity for now", while a permanent stop is a
 * `user_blocks` row. `user_id` is deliberately NOT reassigned on conflict, so a Clerk identity can never
 * migrate from one person to another.
 */
export async function linkIdentity(db, input) {
  const result = await db
    .prepare(
      `INSERT INTO user_identities
         (id, user_id, provider, app_key, clerk_user_id, email_at_link, link_basis, verified_email, last_seen_at)
       VALUES (?, ?, 'clerk', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (provider, clerk_user_id) DO UPDATE SET
         revoked_at    = NULL,
         last_seen_at  = CURRENT_TIMESTAMP,
         email_at_link = COALESCE(excluded.email_at_link, user_identities.email_at_link)`
    )
    .bind(
      `ident_${randomId()}`,
      input.userId,
      normalizeAppKey(input.appKey),
      input.clerkUserId,
      input.email || null,
      input.basis,
      input.verifiedEmail ? 1 : 0
    )
    .run();
  return (result?.meta?.changes ?? 1) > 0;
}

export async function revokeIdentity(db, identityId, note = null) {
  await db
    .prepare("UPDATE user_identities SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL")
    .bind(identityId)
    .run();

  if (note) {
    await logOperationEvent(db, {
      eventType: "user_identities.revoked",
      severity: "warning",
      entityType: "user_identity",
      entityId: identityId,
      message: note,
    });
  }
}

export async function listUserIdentities(db, userId) {
  const result = await db
    .prepare(
      `SELECT id, provider, app_key, clerk_user_id, email_at_link, link_basis, verified_email,
              linked_at, last_seen_at, revoked_at
       FROM user_identities WHERE user_id = ? ORDER BY linked_at`
    )
    .bind(userId)
    .all();
  return result.results || [];
}

/** Appends an account-status change. Current status = newest row by `effective_at`, then `recorded_at`. */
export async function recordUserStatusEvent(db, userId, status, reason = null, actorUserId = null, effectiveAt = null) {
  const recordedAt = nowSqlite();
  await db
    .prepare(
      `INSERT INTO user_status_events (id, user_id, status, reason, actor_user_id, effective_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(`status_${randomId()}`, userId, status, reason, actorUserId, effectiveAt || recordedAt, recordedAt)
    .run();
}

export async function getCurrentUserStatus(db, userId) {
  const row = await db
    .prepare(
      `SELECT status FROM user_status_events
       WHERE user_id = ? ORDER BY effective_at DESC, recorded_at DESC LIMIT 1`
    )
    .bind(userId)
    .first();
  return row?.status || null;
}

/**
 * Appends a membership change. A premium user is never deleted, only downgraded, so this table is the timeline
 * and the newest `effective_at` is the current membership.
 */
export async function recordMembershipEvent(db, input) {
  const recordedAt = nowSqlite();
  await db
    .prepare(
      `INSERT INTO user_membership_events
         (id, user_id, status, reason, source_site_id, effective_at, recorded_by_user_id, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      `member_${randomId()}`,
      input.userId,
      input.status,
      input.reason || null,
      input.siteId || SITE_ID,
      input.effectiveAt || recordedAt,
      input.actorUserId || null,
      recordedAt
    )
    .run();
}

export async function getCurrentMembership(db, userId) {
  const row = await db
    .prepare(
      `SELECT status FROM user_membership_events
       WHERE user_id = ? ORDER BY effective_at DESC, recorded_at DESC LIMIT 1`
    )
    .bind(userId)
    .first();
  return row?.status || null;
}

function normalizeAppKey(value) {
  return String(value || "").trim() || "unknown_app";
}

/**
 * Blocked-account helpers.
 *
 * A person may ask to have their data deleted and their account blocked. The block is enforced by comparing a
 * salted hash of the normalised email, so the tombstone cannot be read back as personal data. That makes the
 * salt load-bearing: if it changes, every stored hash stops matching and previously blocked addresses could
 * register again.
 *
 * This lives here rather than in a small helper module deliberately — both sites must compute exactly the same
 * hash, and this file is the one the parity check compares.
 */
function normalizeBlockEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function hashBlockedEmail(email, salt) {
  const normalized = normalizeBlockEmail(email);
  if (!normalized) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${normalized}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Blocks an address for good and records the status change.
 *
 * Refuses without a salt. Writing a hash we cannot reproduce would produce a block that never matches anything,
 * which is worse than no block at all because it looks enforced.
 */
/** The block itself, as a statement rather than an execution, so a caller can commit it atomically with other work. */
export async function blockAccountStatements(db, input) {
  if (!input?.salt) {
    throw new AuthError("Pemblokiran akun butuh USER_BLOCK_SALT yang belum diset.", 503, "BLOCK_SALT_MISSING");
  }

  const emailHash = await hashBlockedEmail(input.email, input.salt);
  if (!emailHash) {
    throw new AuthError("Alamat email tidak valid untuk diblokir.", 400, "BLOCK_EMAIL_REQUIRED");
  }

  const statement = db
    .prepare(
      `INSERT INTO user_blocks
         (id, user_id, email_hash, hash_algorithm, reason, request_source, acknowledged_at, acknowledgement_version)
       VALUES (?, ?, ?, 'sha256+salt-v1', ?, ?, ?, ?)
       ON CONFLICT (email_hash) DO UPDATE SET
         revoked_at               = NULL,
         revoked_by_user_id       = NULL,
         revoke_note              = NULL,
         reason                   = excluded.reason,
         request_source           = excluded.request_source,
         acknowledged_at          = excluded.acknowledged_at,
         acknowledgement_version  = excluded.acknowledgement_version,
         blocked_at               = CURRENT_TIMESTAMP`
    )
    .bind(
      `block_${randomId()}`,
      input.userId || null,
      emailHash,
      input.reason || null,
      input.requestSource === "self_service" ? "self_service" : "admin",
      input.acknowledgedAt || nowSqlite(),
      input.acknowledgementVersion || "unspecified"
    );

  return { statements: [statement], emailHash };
}

export async function blockAccount(db, input) {
  const { statements, emailHash } = await blockAccountStatements(db, input);

  await db.batch(statements);

  if (input.userId) {
    await recordUserStatusEvent(db, input.userId, "blocked", input.reason || "account blocked", input.actorUserId || null);
  }

  return { email_hash: emailHash };
}

/** Lifts a block. The row is kept, so the history of who was blocked and when survives. */
export async function unblockAccount(db, input) {
  if (!input?.salt) {
    throw new AuthError("Pembukaan blokir butuh USER_BLOCK_SALT yang belum diset.", 503, "BLOCK_SALT_MISSING");
  }

  await db
    .prepare(
      `UPDATE user_blocks
       SET revoked_at = ?, revoked_by_user_id = ?, revoke_note = ?
       WHERE email_hash = ? AND revoked_at IS NULL`
    )
    .bind(nowSqlite(), input.actorUserId || null, input.note || null, await hashBlockedEmail(input.email, input.salt))
    .run();
}

/**
 * Whether this address is blocked, and what to do when we cannot tell.
 *
 * With no salt but no blocks either, there is nothing to enforce and sign-in continues — the state the live sites
 * are actually in today. With no salt *and* blocks present, refusing is the only safe answer: we cannot prove the
 * person in front of us is not a blocked address.
 */
async function assertEmailNotBlocked(db, email, salt) {
  if (!salt) {
    const anyBlock = await blockStateQuery(db, "SELECT 1 AS present FROM user_blocks WHERE revoked_at IS NULL LIMIT 1", []);

    if (anyBlock) {
      throw new AuthError(
        "Sistem sedang tidak bisa memverifikasi status akun. Hubungi admin.",
        503,
        "BLOCK_SALT_MISSING"
      );
    }
    return;
  }

  if (!email) return;

  const blocked = await blockStateQuery(
    db,
    "SELECT id FROM user_blocks WHERE email_hash = ? AND revoked_at IS NULL LIMIT 1",
    [await hashBlockedEmail(email, salt)]
  );

  if (blocked) {
    throw new AuthError(
      "Data pengguna ini telah dihapus dan diblokir dari sistem kami. Silakan mendaftar dengan email yang berbeda bila ingin bergabung kembali.",
      403,
      "ACCOUNT_BLOCKED"
    );
  }
}

/**
 * Runs a block-status query and turns **any** failure into a 503 that stops the identity transaction.
 *
 * This was fail-open, and that was the worst possible default: the previous version caught the error and
 * substituted `null`, which is indistinguishable from "no block found". An unreadable `user_blocks` table — a
 * transient D1 error, or the migration not applied — therefore looked exactly like an empty one and let a blocked
 * address through the very check whose job is to stop it. Because this guard runs before any identity link or
 * insert, failing open here is an authorization bypass, not a degraded experience.
 *
 * Failing closed costs a retry. Failing open costs the control. An empty table still returns `null` normally, so
 * ordinary sign-in is unaffected.
 */
async function blockStateQuery(db, sql, bindings) {
  try {
    return await db.prepare(sql).bind(...bindings).first();
  } catch (error) {
    throw new AuthError(
      "Sistem sedang tidak bisa memverifikasi status akun. Silakan coba lagi sebentar lagi.",
      503,
      "BLOCK_STATUS_UNAVAILABLE"
    );
  }
}

/**
 * Millisecond timestamps in SQLite's own text format.
 *
 * `CURRENT_TIMESTAMP` is only second-granular, so two status events written in the same second order
 * arbitrarily and "the newest row wins" stops being deterministic — which is exactly the rule the status and
 * membership timelines depend on. This produces `YYYY-MM-DD HH:MM:SS.mmm`, which sorts correctly against the
 * second-precision values already stored.
 */
function nowSqlite() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
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
  // Identities are the authority: one D1 user can now be reached through more than one Clerk application, so
  // this must not look only at the home identity column.
  //
  // The status is computed with a CASE rather than returned raw, because a block lives in `user_blocks` and not
  // in `users.status`. Without this the fast path would report a blocked account as `active` and let it straight
  // through, since `requireD1UserFast` only falls back to the full sync when the status is not active.
  const viaIdentity = await db
    .prepare(
      `SELECT u.id, u.clerk_user_id, u.primary_email, u.display_name,
              CASE WHEN EXISTS (SELECT 1 FROM user_blocks b WHERE b.user_id = u.id AND b.revoked_at IS NULL)
                   THEN 'blocked' ELSE u.status END AS status
       FROM user_identities i
       JOIN users u ON u.id = i.user_id
       WHERE i.provider = 'clerk' AND i.clerk_user_id = ? AND i.revoked_at IS NULL
       LIMIT 1`
    )
    .bind(clerkUserId)
    .first();

  if (viaIdentity) return viaIdentity;

  // Fallback for a row that genuinely predates user_identities. It is deliberately restricted to users with NO
  // identity rows at all: a plain `WHERE clerk_user_id = ?` would also match the home identity of a user whose
  // identity has just been revoked, quietly re-admitting the very access that revocation was meant to cut off.
  return db
    .prepare(
      `SELECT u.id, u.clerk_user_id, u.primary_email, u.display_name,
              CASE WHEN EXISTS (SELECT 1 FROM user_blocks b WHERE b.user_id = u.id AND b.revoked_at IS NULL)
                   THEN 'blocked' ELSE u.status END AS status
       FROM users u
       WHERE u.clerk_user_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM user_identities i WHERE i.user_id = u.id AND i.provider = 'clerk'
         )
       LIMIT 1`
    )
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
  // A D1 failure is not an authorization failure. Reporting it as 500 told the client something was wrong with the
  // request and skipped the retry hint, when what happened is that the data layer was briefly unavailable and the
  // session is still perfectly valid. Mirrors the sibling copy.
  if (/D1_ERROR|D1_EXEC_ERROR/i.test(String(error?.message || ""))) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "ACCOUNT_DATA_UNAVAILABLE",
        message: "Layanan data akun sedang tidak tersedia. Sesi login Anda tetap aktif. Silakan coba lagi nanti.",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": "300" }
      }
    );
  }
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
export async function upsertD1User(db, clerkUser, options = {}) {
  const primaryEmail = getPrimaryEmail(clerkUser);
  const displayName = getDisplayName(clerkUser, primaryEmail);
  const appKey = normalizeAppKey(options.appKey);

  // Refuse a blocked address before anything is linked or created. This has to happen first: a check that ran
  // after the email link or the insert would let the same person simply register again.
  await assertEmailNotBlocked(db, primaryEmail, options.blockSalt);

  // 1. Resolve by identity. Identities are the authority now that a person can arrive through more than one
  //    Clerk application; `users.clerk_user_id` is only the home identity and is never overwritten here.
  const existing = await db
    .prepare(
      `SELECT i.id AS identity_id, u.id AS id, u.primary_email, u.display_name, u.status,
              (SELECT 1 FROM user_blocks b WHERE b.user_id = u.id AND b.revoked_at IS NULL LIMIT 1) AS blocked
       FROM user_identities i
       JOIN users u ON u.id = i.user_id
       WHERE i.provider = 'clerk' AND i.clerk_user_id = ? AND i.revoked_at IS NULL
       LIMIT 1`
    )
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

    await db
      .prepare(
        `UPDATE user_identities
         SET last_seen_at = CURRENT_TIMESTAMP, email_at_link = COALESCE(email_at_link, ?)
         WHERE id = ?`
      )
      .bind(primaryEmail, existing.identity_id)
      .run();

    const user = {
      id: existing.id,
      clerk_user_id: clerkUser.id,
      primary_email: primaryEmail,
      display_name: displayName,
      status: existing.blocked ? "blocked" : existing.status || "active",
    };
    if (user.status === "active") await applyEmailRoleGrants(db, user);
    return user;
  }

  // 2. Link a new identity by verified email — but only when that email identifies exactly one person.
  //
  //    Nothing in the schema stops two users rows sharing an email (there is no UNIQUE on primary_email), and
  //    `LIMIT 1` would then pick one arbitrarily and hand them someone else's account. So the lookup asks for
  //    two rows: one match links, none creates a new person, and more than one refuses to guess, creates a
  //    separate account, and raises a warning. A linker that cannot tell two people apart must not choose.
  const emailMatches = primaryEmail && isPrimaryEmailVerified(clerkUser)
    ? await db
        .prepare(
          `SELECT id, clerk_user_id, primary_email, display_name, status,
                  (SELECT 1 FROM user_blocks b WHERE b.user_id = users.id AND b.revoked_at IS NULL LIMIT 1) AS blocked
           FROM users WHERE lower(primary_email) = ? LIMIT 2`
        )
        .bind(normalizeEmail(primaryEmail))
        .all()
    : null;

  const emailCandidates = emailMatches?.results || [];
  const existingByEmail = emailCandidates.length === 1 ? emailCandidates[0] : null;

  if (emailCandidates.length > 1) {
    await logOperationEvent(db, {
      eventType: "user_identities.link_ambiguous",
      severity: "warning",
      entityType: "clerk_user",
      entityId: clerkUser.id,
      message: `${emailCandidates.length} D1 users share this verified email; refusing to guess which one to link`,
      metadata: { app_key: appKey, candidate_count: emailCandidates.length },
    });
  }

  if (existingByEmail) {
    await db
      .prepare(
        `UPDATE users
         SET primary_email = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(primaryEmail, displayName, existingByEmail.id)
      .run();

    // Link rather than rebind. `users.clerk_user_id` stays the home identity, so a second application cannot
    // take the row over from the first; every additional identity is a row of its own, matched by verified
    // email and recorded with how and when it was linked.
    await linkIdentity(db, {
      userId: existingByEmail.id,
      appKey,
      clerkUserId: clerkUser.id,
      email: primaryEmail,
      basis: "verified_email",
      verifiedEmail: 1,
    });

    await flagPrivilegedIdentityLink(db, existingByEmail.id, appKey);

    const user = {
      id: existingByEmail.id,
      clerk_user_id: clerkUser.id,
      primary_email: primaryEmail,
      display_name: displayName,
      status: existingByEmail.blocked ? "blocked" : existingByEmail.status || "active",
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

  await linkIdentity(db, {
    userId,
    appKey,
    clerkUserId: clerkUser.id,
    email: primaryEmail,
    basis: "first_identity",
    verifiedEmail: 0,
  });
  await recordUserStatusEvent(db, userId, "active", "first sign-in on this network");

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
  // A blocked account gets its own message. "Not active" would read like a temporary state, when what actually
  // happened is that the person asked for their data to be deleted and their account blocked for good.
  if (user?.status === "blocked") {
    throw new AuthError(
      "Data pengguna ini telah dihapus dan diblokir dari sistem kami. Silakan mendaftar dengan email yang berbeda bila ingin bergabung kembali.",
      403,
      "ACCOUNT_BLOCKED"
    );
  }

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

/**
 * A link that reaches a privileged row is allowed — that is the accepted policy — but it must be visible, so
 * that an unexpected admin link is something an operator can actually find rather than something nobody saw.
 */
async function flagPrivilegedIdentityLink(db, userId, appKey) {
  const role = await db
    .prepare("SELECT role FROM user_roles WHERE user_id = ? AND role IN ('admin', 'staff') LIMIT 1")
    .bind(userId)
    .first();

  if (!role) return;

  await logOperationEvent(db, {
    eventType: "user_identities.link_privileged",
    severity: "warning",
    entityType: "user",
    entityId: userId,
    message: `a ${role.role} identity was linked from ${normalizeAppKey(appKey)} by verified email`,
    metadata: { app_key: normalizeAppKey(appKey), role: role.role },
  });
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
