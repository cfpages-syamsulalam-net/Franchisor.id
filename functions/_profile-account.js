import { createClerkClient } from "@clerk/backend";
import { blockAccountStatements, getCurrentMembership, hashBlockedEmail, membershipEventStatement, syncClerkMetadataForD1User, syncClerkMetadataFromD1, userStatusEventStatement } from "./_clerk-auth.js";
import { eraseAccount } from "./_account-erasure.js";
import { logOperationEvent } from "./_telemetry.js";
import { queueOwnerReview } from "./_profile-owner-review.js";
import { auditStatement, getPrimaryEmail, jsonResponse, randomId, splitDisplayName } from "./_profile-utils.js";
import { SITE_FRANCHISOR_ID } from "./_site-publish-queue.js";

/**
 * Settings → "Hapus & blokir akun saya".
 *
 * Blocks the account permanently and records the acknowledged consequences. `user_blocks` keeps the
 * acknowledgement version, so we can always show what the person was actually told when they agreed.
 *
 * **What this does not do yet:** the data erasure the screen also describes is plan step 0.7b and is not
 * implemented. The message below therefore says what really happens now and names the erasure as an
 * admin-executed follow-up, rather than claiming data that still exists has been deleted. When 0.7b lands this
 * runs the erasure before responding, the copy tightens, and the acknowledgement version is bumped — which is
 * precisely why the version is recorded rather than assumed.
 */
export async function deleteAccount(env, db, actor, data) {
  // Every verified address the person holds, not just the one they signed in with. Erasure blocks the person,
  // and the block must name every address that could let them back in — blocking only the arriving address while
  // a sibling verified email goes unmentioned is exactly the re-entry the email-link path would then permit.
  // `actor.clerk_user` is the live Clerk record from authentication, so its addresses are the person's own doing,
  // not caller-supplied input.
  const verifiedEmails = uniqueVerifiedEmails(actor.clerk_user);
  const email = actor.primary_email;

  if (!email) {
    return jsonResponse(
      {
        success: false,
        error: "NO_EMAIL",
        message: "Akun ini tidak punya email utama, jadi belum bisa diblokir sendiri. Hubungi admin.",
      },
      { status: 400 }
    );
  }

  if (!env?.USER_BLOCK_SALT) {
    // Refused rather than half-done: without the salt we cannot write a hash that will ever match, so the block
    // would look enforced while blocking nothing at all.
    return jsonResponse(
      {
        success: false,
        error: "BLOCK_SALT_MISSING",
        message: "Pemblokiran akun belum bisa diproses sekarang. Hubungi admin.",
      },
      { status: 503 }
    );
  }

  // The contract, before anything irreversible. Required for everyone, not only paid members, because the wording
  // covers both cases — and because a conditional requirement here is exactly where the client and the server
  // would drift apart about whether a signature is needed. Re-checked server-side even though the schema enforces
  // it, because this handler is also reachable directly.
  if (!data.contract_version || !data.signer_full_name || !data.signature_format || !data.signature_payload) {
    return jsonResponse(
      {
        success: false,
        error: "CONTRACT_REQUIRED",
        message:
          "Kontrak penghapusan harus dibaca, diisi nama lengkap, dan ditandatangani sebelum akun bisa dihapus.",
      },
      { status: 400 }
    );
  }

  // Snapshot the entitlement at the moment of signing, so the forfeiture can be shown to have applied to a real
  // membership rather than to nothing. Read before the batch, while the rows still describe the person.
  const membershipAtSigning = await getCurrentMembership(db, actor.id);
  const membershipEvent = await db
    .prepare(
      `SELECT effective_at FROM user_membership_events
       WHERE user_id = ? ORDER BY effective_at DESC, recorded_at DESC LIMIT 1`
    )
    .bind(actor.id)
    .first()
    .catch(() => null);

  // The block and the erasure are committed as **one batch**. Previously the block was written first and the
  // erasure second, so a failed erasure left the person blocked with their data still present — a state with no
  // way out, because the block is exactly what stops them signing in to try again. Now either both land or
  // neither does, and the screen can simply be used again.
  const { statements: blockStatements, emailHash } = await blockAccountStatements(db, {
    userId: actor.id,
    email,
    salt: env.USER_BLOCK_SALT,
    reason: `self-service deletion request (${data.acknowledgement_version})`,
    requestSource: "self_service",
    acknowledgementVersion: data.acknowledgement_version,
    actorUserId: actor.id,
    // Every verified address, so no sibling email survives unblocked. The primary address is first; the block row
    // itself carries the primary hash (it is what the consent evidence references), and the extras are committed
    // in the same batch right after it.
    extraEmails: verifiedEmails.filter((address) => address !== email.toLowerCase()),
  });

  // The signed contract, committed with the erasure rather than before it: a signature without an erasure is a
  // record we have no right to hold, and an erasure without its evidence is a decision we cannot prove.
  const consentStatements = [
    db
      .prepare(
        `INSERT INTO account_erasure_consents
           (id, user_id, email_hash, signer_full_name, signature_format, signature_payload,
            signature_point_count, contract_version, acknowledgement_version,
            membership_status_at_signing, membership_effective_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `consent_${randomId()}`,
        actor.id,
        emailHash || null,
        data.signer_full_name,
        data.signature_format,
        data.signature_payload,
        data.signature_point_count || null,
        data.contract_version,
        data.acknowledgement_version,
        membershipAtSigning || null,
        membershipEvent?.effective_at || null
      ),
  ];

  // The terminal events commit **inside** the erasure batch (passed as statements), not after it: they
  // describe the outcome of that batch, so a failure between the two would leave an erased-and-blocked person
  // whose timeline still says premium and active — with no screen left to retry from. Either everything lands or
  // nothing does.
  const terminalStatements = [
    // Entitlement ends here. `getCurrentMembership` reads the newest membership event, so without this an erased
    // paid user keeps reading as Premium — wrong on its own terms, and exactly what the forfeiture clause promises
    // will not happen. The billing rows (`premium_orders`, `franchise_subscriptions`) are deliberately retained as
    // the financial record; only the *current* status moves.
    membershipEventStatement(db, {
      userId: actor.id,
      status: "free",
      reason: "account_deleted",
      siteId: SITE_FRANCHISOR_ID,
    }),
    // The status is `blocked`, not `deleted`: `user_status_events.status` has a CHECK constraint allowing only
    // active/pending/suspended/blocked, so a `deleted` event is impossible to record — and `blocked` is what the
    // person actually is for access purposes, which is why `assertActiveD1User` already answers an erased account
    // with the "data dihapus dan diblokir" message. The `users` row separately carries `status = 'deleted'` to
    // record that the data is gone.
    userStatusEventStatement(
      db,
      actor.id,
      "blocked",
      `akun dihapus atas permintaan sendiri (${data.acknowledgement_version})`,
      actor.id
    ),
  ];

  const erasure = await eraseAccount(db, actor.id, {
    bucket: env.FRANCHISE_ASSETS,
    homeSiteId: SITE_FRANCHISOR_ID,
    blockStatements,
    consentStatements,
    terminalStatements,
  });

  await logOperationEvent(db, {
    eventType: "account.erased",
    severity: "warning",
    entityType: "user",
    entityId: actor.id,
    message:
      "self-service account erasure: identities removed, personal rows deleted, business records retained against an anonymous shell",
    metadata: {
      acknowledgement_version: data.acknowledgement_version,
      brands_removed: erasure.brandsRemoved.length,
      // Recorded rather than ignored: a brand left standing is a decision (ownership was never proven), and an
      // operator should be able to see that it was one.
      brands_left_standing: erasure.brandsLeftStanding.length,
      objects_deleted: erasure.objectsDeleted,
    },
  });

  return jsonResponse({
    success: true,
    blocked: true,
    erased: true,
    message:
      "Akun Anda sudah dihapus dan diblokir permanen. Anda tidak bisa masuk lagi, dan email ini tidak bisa dipakai untuk mendaftar lagi.",
  });
}

export async function updateAccount(env, db, actor, data) {
  const nextEmail = data.email.toLowerCase();
  const currentEmail = (actor.primary_email || getPrimaryEmail(actor.clerk_user) || "").toLowerCase();
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const nameParts = splitDisplayName(data.display_name);

  // Check D1 **before** touching Clerk, and before Clerk is even called, because the two systems have separate
  // uniqueness. Clerk will happily accept an address that D1 has already given to somebody else on the sibling
  // site, and the D1 write only rejects it afterwards — by which point Clerk is already holding the new address
  // and the same person's two identity records disagree. A clear conflict here is also the difference between a
  // user who can correct their input and a generic server error after a half-applied change.
  let emailChanging = nextEmail !== currentEmail;
  if (emailChanging) {
    // The D1 uniqueness that protects the person being changed — and everyone else. `idx_users_primary_email_unique`
    // rejects a second row on the same address, but the check below also refuses an address that is *blocked*:
    // without it, changing to an erased address would pass the owner check (the shell holds a placeholder, not the
    // address) and then fail inside the batch on the block — or worse, succeed into a half-linked state. Refusing
    // here keeps the failure at the input, before Clerk is touched. Without a salt the hash cannot be computed,
    // so the check is skipped rather than guessed — the batch's unique index remains the backstop.
    let blockedTarget = null;
    if (env.USER_BLOCK_SALT) {
      const targetHash = await hashBlockedEmail(nextEmail, env.USER_BLOCK_SALT).catch(() => "");
      if (targetHash) {
        blockedTarget = await db
          .prepare("SELECT id FROM user_blocks WHERE email_hash = ? AND revoked_at IS NULL LIMIT 1")
          .bind(targetHash)
          .first()
          .catch(() => null);
      }
    }
    if (blockedTarget) {
      return jsonResponse(
        {
          success: false,
          error: "EMAIL_BLOCKED",
          message:
            "Email ini tidak bisa dipakai karena terikat pada akun yang sudah dihapus dan diblokir. Gunakan email lain.",
        },
        { status: 409 }
      );
    }
    const owner = await db
      .prepare("SELECT id FROM users WHERE lower(primary_email) = ? AND id <> ? LIMIT 1")
      .bind(nextEmail, actor.id)
      .first();

    if (owner) {
      return jsonResponse(
        {
          success: false,
          error: "EMAIL_TAKEN",
          message:
            "Email ini sudah dipakai akun lain di jaringan kami. Gunakan email lain, atau masuk memakai email tersebut.",
        },
        { status: 409 }
      );
    }
  }

  let clerkUser = await clerk.users.updateUser(actor.clerk_user_id, {
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
  });

  if (emailChanging) {
    if (typeof clerk.users.replaceUserEmailAddress !== "function") {
      throw new Error("Perubahan email belum tersedia. Coba ubah nama terlebih dahulu, atau hubungi tim kami.");
    }
    await clerk.users.replaceUserEmailAddress(actor.clerk_user_id, { emailAddress: nextEmail });
    clerkUser = await clerk.users.getUser(actor.clerk_user_id);
  }

  // Account identity edits apply immediately. A published brand's PIC and contact
  // e-mail are a different thing: they are public, trust-sensitive brand data, so they
  // go through the same owner review proposal the profile page uses and the live page
  // keeps its current values until an admin approves. An unpublished profile (or no
  // profile at all) can still be written directly — nothing public changes.
  const profile = await db
    .prepare("SELECT id, pic_name, email_contact FROM franchisor_profiles WHERE user_id = ? LIMIT 1")
    .bind(actor.id)
    .first();

  const statements = [
    db
      .prepare("UPDATE users SET primary_email = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(nextEmail, data.display_name, actor.id),
    db
      .prepare("UPDATE franchisee_profiles SET name = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?")
      .bind(data.display_name, nextEmail, actor.id),
  ];

  let brandContactReview = null;
  if (profile) {
    const nextPicName = data.display_name ?? null;
    const nextContactEmail = nextEmail || null;
    const changes = {};
    if ((profile.pic_name ?? null) !== nextPicName) changes.profile_pic_name = nextPicName;
    if ((profile.email_contact ?? null) !== nextContactEmail) changes.profile_email_contact = nextContactEmail;

    if (Object.keys(changes).length) {
      const published = await db
        .prepare(
          `SELECT f.id FROM franchises f
           JOIN franchise_site_publications p ON p.franchise_id = f.id
           WHERE f.franchisor_profile_id = ? AND f.owner_user_id = ?
             AND p.site_id = ? AND p.publication_status = 'published' LIMIT 1`,
        )
        .bind(profile.id, actor.id, SITE_FRANCHISOR_ID)
        .first();
      if (published) {
        const previous = {
          profile_pic_name: profile.pic_name ?? null,
          profile_email_contact: profile.email_contact ?? null,
        };
        const review = await queueOwnerReview(db, actor, published.id, changes, previous, "franchisor_profile");
        brandContactReview = review.pending ? "pending" : "conflict";
      } else {
        statements.push(
          db
            .prepare("UPDATE franchisor_profiles SET pic_name = ?, email_contact = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(nextPicName, nextContactEmail, profile.id),
        );
      }
    }
  }

  statements.push(
    auditStatement(db, "profile.account.update", "users", actor.id, {
      email_changed: nextEmail !== currentEmail,
      brand_contact_review: brandContactReview,
    }, actor.id),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    // The pre-flight above closes the ordinary case; this is the race guard for two requests claiming the same
    // address at once, where `0044`'s unique index is what finally decides. Clerk already holds the new address
    // by now, so put it back rather than leave the two systems disagreeing about who this person is.
    if (emailChanging && isUniqueEmailViolation(error)) {
      const restored = await restoreClerkEmail(clerk, actor.clerk_user_id, currentEmail);
      return jsonResponse(
        {
          success: false,
          error: "EMAIL_TAKEN",
          message: restored
            ? "Email ini baru saja dipakai akun lain, jadi perubahan dibatalkan dan email Anda dikembalikan seperti semula. Coba lagi dengan email yang berbeda."
            : "Email ini bentrok dengan akun lain dan perubahan belum sepenuhnya dibatalkan. Hubungi tim kami sebelum mencoba lagi.",
        },
        { status: 409 }
      );
    }
    throw error;
  }

  const updatedUser = {
    id: actor.id,
    clerk_user_id: actor.clerk_user_id,
    primary_email: nextEmail,
    display_name: data.display_name,
    status: actor.status || "active",
  };
  await syncClerkMetadataFromD1(env, updatedUser, actor.roles || []);

  return jsonResponse({
    success: true,
    status: brandContactReview === "pending" ? "pending" : "saved",
    brand_contact_review: brandContactReview,
    user: {
      id: actor.id,
      email: getPrimaryEmail(clerkUser) || nextEmail,
      display_name: data.display_name,
      roles: (actor.roles || []).map((role) => role.role).filter(Boolean),
    },
  });
}

/**
 * Whether a D1 failure is `0044`'s one-address-one-person index rejecting the write.
 *
 * Matched on the message because the driver surfaces the constraint name rather than something structured. If the
 * wording ever changes this stops matching, and the failure falls through to the generic path — which is the safe
 * direction: an unrecognised error is rethrown rather than being reported as a duplicate-email conflict.
 */
function isUniqueEmailViolation(error) {
  return /unique constraint failed[\s\S]*primary_email|idx_users_primary_email_unique/i.test(
    String((error && error.message) || "")
  );
}

/**
 * Best-effort rollback of a Clerk email change after D1 refused it.
 *
 * Returns whether Clerk is back on the previous address. It may need re-verification afterwards, which is
 * acceptable: the address is the one D1 still holds, so the two systems agree, and the response tells the person
 * to contact support if the rollback itself failed.
 */
async function restoreClerkEmail(clerk, clerkUserId, email) {
  try {
    if (!email || typeof clerk.users.replaceUserEmailAddress !== "function") return false;
    await clerk.users.replaceUserEmailAddress(clerkUserId, { emailAddress: email });
    return true;
  } catch (error) {
    return false;
  }
}

export async function addPublicRole(env, db, actor, data, loadProfileData) {
  const currentRoles = new Set((actor.roles || []).map((row) => row.role));
  if (currentRoles.has("admin") || currentRoles.has("staff")) {
    return jsonResponse({ success: false, message: "Akses ini sudah tersedia untuk akun Anda." }, { status: 400 });
  }
  if (currentRoles.has(data.role)) {
    return jsonResponse({ success: true, already_has_role: true, role: data.role, profile: await loadProfileData(db, actor) });
  }

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO user_roles (id, user_id, role, scope_type, scope_id, site_id, assigned_by_user_id)
         VALUES (?, ?, ?, 'network', 'network', ?, ?)`,
      )
      .bind(`role_${randomId()}`, actor.id, data.role, SITE_FRANCHISOR_ID, actor.id),
    auditStatement(db, "profile.role.add", "users", actor.id, { role: data.role, source: "profile" }, actor.id),
  ]);

  const synced = await syncClerkMetadataForD1User(env, db, {
    id: actor.id,
    clerk_user_id: actor.clerk_user_id,
    primary_email: actor.primary_email,
    display_name: actor.display_name,
    status: actor.status || "active",
  });

  return jsonResponse({
    success: true,
    role: data.role,
    profile: await loadProfileData(db, { ...actor, roles: synced.roles || [] }),
  });
}

/**
 * Every verified email on the authenticated Clerk user, normalised and deduplicated.
 *
 * Read from the live Clerk record (not from caller input): these are the person's own verified addresses, which
 * is what makes them safe to block on. Shares its shape with the resolver's `verifiedEmails` — the two must
 * agree on what "the person's addresses" means, or erasure blocks a different set than sign-in checks.
 */
function uniqueVerifiedEmails(clerkUser) {
  const addresses = clerkUser?.emailAddresses || clerkUser?.email_addresses || [];
  const seen = new Set();
  const verified = [];
  for (const item of addresses) {
    const status = item?.verification?.status || item?.verification_status || item?.status;
    if (status !== "verified") continue;
    const address = String(item?.emailAddress || item?.email_address || "").trim().toLowerCase();
    if (!address || seen.has(address)) continue;
    seen.add(address);
    verified.push(address);
  }
  return verified;
}
