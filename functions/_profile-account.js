import { createClerkClient } from "@clerk/backend";
import { blockAccount, syncClerkMetadataForD1User, syncClerkMetadataFromD1 } from "./_clerk-auth.js";
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

  await blockAccount(db, {
    userId: actor.id,
    email,
    salt: env.USER_BLOCK_SALT,
    reason: `self-service deletion request (${data.acknowledgement_version})`,
    requestSource: "self_service",
    acknowledgementVersion: data.acknowledgement_version,
    actorUserId: actor.id,
  });

  await logOperationEvent(db, {
    eventType: "account.deletion_requested",
    severity: "warning",
    entityType: "user",
    entityId: actor.id,
    message: "self-service account deletion: account blocked, erasing",
    metadata: { acknowledgement_version: data.acknowledgement_version },
  });

  // The block goes in first, so that even if the erasure fails the person cannot sign in again. An erased account
  // that is not blocked would be one that can simply re-register.
  const erasure = await eraseAccount(db, actor.id, { bucket: env.FRANCHISE_ASSETS });

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

  let clerkUser = await clerk.users.updateUser(actor.clerk_user_id, {
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
  });

  if (nextEmail !== currentEmail) {
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

  await db.batch(statements);

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
