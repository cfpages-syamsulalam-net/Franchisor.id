import {
  PREMIUM_EXPIRING_LOOKAHEAD_DAYS,
  PREMIUM_NETWORK_SITE_IDS,
} from "./_premium.js";
import { membershipEventStatement } from "./_clerk-auth.js";
import { SITE_FRANCHISOR_ID, siteRebuildStatements } from "./_site-publish-queue.js";
import { loadPremiumSettings } from "./_premium-settings.js";
import { createPremiumNotification, queueNotificationEmail } from "./_premium-notifications.js";
import { clampNumber, escapeHtml, formatDate, randomId, safeAll, textOrNull } from "./_premium-ops-utils.js";

export const PREMIUM_REMINDER_TYPES = [
  { type: "renewal_1d", maxDays: 1, label: "1 hari" },
  { type: "renewal_7d", maxDays: 7, label: "7 hari" },
  { type: "renewal_14d", maxDays: 14, label: "14 hari" },
  { type: "renewal_30d", maxDays: 30, label: "30 hari" },
];

export async function loadPremiumAnnualReports(db, limit = 8) {
  return safeAll(
    db,
    `SELECT
       r.id, r.subscription_id, r.franchise_id, r.user_id, r.period_start_at, r.period_end_at,
       r.listing_views, r.saves, r.inquiries, r.contact_clicks, r.leads, r.queued_email_id, r.created_at,
       f.brand_name,
       u.primary_email
     FROM premium_annual_reports r
     JOIN franchises f ON f.id = r.franchise_id
     LEFT JOIN users u ON u.id = r.user_id
     ORDER BY r.created_at DESC
     LIMIT ?`,
    [Math.max(1, Math.min(Number(limit || 8), 30))],
  );
}

export async function loadExpiringPremiumSubscriptions(db, days = PREMIUM_EXPIRING_LOOKAHEAD_DAYS) {
  try {
    const result = await db
      .prepare(
        `SELECT
           s.id, s.franchise_id, s.user_id, s.plan_code, s.status, s.starts_at, s.ends_at, s.renewal_status,
           f.brand_name, f.slug,
           u.primary_email, u.display_name,
           ROUND(julianday(s.ends_at) - julianday('now')) AS days_left
         FROM franchise_subscriptions s
         JOIN franchises f ON f.id = s.franchise_id
         LEFT JOIN users u ON u.id = s.user_id
         WHERE s.status = 'active'
           AND s.ends_at > CURRENT_TIMESTAMP
           AND s.ends_at <= datetime('now', ?)
         ORDER BY s.ends_at ASC
         LIMIT 40`,
      )
      .bind(`+${Number(days || PREMIUM_EXPIRING_LOOKAHEAD_DAYS)} days`)
      .all();
    return result.results || [];
  } catch (_error) {
    return [];
  }
}

export async function queuePremiumRenewalReminders(db) {
  const rows = await loadExpiringPremiumSubscriptions(db, PREMIUM_EXPIRING_LOOKAHEAD_DAYS);
  let queued = 0;
  for (const row of rows || []) {
    const reminder = reminderTypeForDays(Number(row.days_left || 0));
    if (!reminder || !textOrNull(row.primary_email)) continue;
    const exists = await db
      .prepare(
        `SELECT id
         FROM premium_subscription_reminders
         WHERE subscription_id = ? AND reminder_type = ?
         LIMIT 1`,
      )
      .bind(row.id, reminder.type)
      .first()
      .catch(() => null);
    if (exists) continue;

    const brandName = row.brand_name || "Listing Anda";
    const emailId = await queueNotificationEmail(db, {
      user_id: row.user_id,
      to_email: row.primary_email,
      category: "premium_renewal_reminder",
      subject: `Premium ${brandName} berakhir dalam ${reminder.label}`,
      body_text: [
        `Premium ${brandName} akan berakhir dalam ${reminder.label}.`,
        "Buka profil untuk memperpanjang masa aktif agar status Premium tetap berjalan.",
        "Profil: https://franchisor.id/profil/?tab=membership",
      ].join(" "),
      related_entity_type: "franchise_subscription",
      related_entity_id: row.id,
    });
    if (!emailId) continue;

    await Promise.all([
      db
        .prepare(
          `INSERT INTO premium_subscription_reminders (
             id, subscription_id, franchise_id, user_id, reminder_type, queued_email_id
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(`premium_reminder_${randomId()}`, row.id, row.franchise_id, row.user_id, reminder.type, emailId)
        .run()
        .catch(() => null),
      createPremiumNotification(db, {
        user_id: row.user_id,
        franchise_id: row.franchise_id,
        notification_type: "premium_expiring",
        title: "Premium segera berakhir",
        message: `Premium ${brandName} akan berakhir dalam ${reminder.label}.`,
        action_url: "/profil/?tab=membership",
      }),
    ]);
    queued += 1;
  }
  return queued;
}

export async function processPremiumLifecycle(db) {
  const settings = await loadPremiumSettings(db);
  const annualReportsQueued = Number(settings.annual_report_enabled || 0) === 1
    ? await queuePremiumAnnualReports(db)
    : 0;
  const graceEmailsQueued = Number(settings.grace_daily_email_enabled || 0) === 1
    ? await queuePremiumGraceEmails(db, settings)
    : 0;
  const expiredSubscriptions = await expirePremiumAfterGrace(db, settings);
  return {
    settings,
    annual_reports_queued: annualReportsQueued,
    grace_emails_queued: graceEmailsQueued,
    expired_subscriptions: expiredSubscriptions,
  };
}

export async function markExpiredPremiumSubscriptions(db) {
  const result = await processPremiumLifecycle(db);
  return result.expired_subscriptions || 0;
}

export async function queuePremiumAnnualReports(db) {
  const rows = await safeAll(
    db,
    `SELECT
       s.id, s.franchise_id, s.user_id, s.starts_at, s.ends_at,
       f.brand_name, f.slug,
       u.primary_email
     FROM franchise_subscriptions s
     JOIN franchises f ON f.id = s.franchise_id
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.ends_at <= CURRENT_TIMESTAMP
       AND COALESCE(u.primary_email, '') != ''
       AND NOT EXISTS (
         SELECT 1 FROM premium_annual_reports r
         WHERE r.subscription_id = s.id
       )
     ORDER BY s.ends_at ASC
     LIMIT 20`,
  );
  let queued = 0;
  for (const row of rows) {
    const metrics = await loadAnnualReportMetrics(db, row);
    const email = annualReportEmail(row, metrics);
    const emailId = await queueNotificationEmail(db, {
      user_id: row.user_id,
      to_email: row.primary_email,
      category: "premium_annual_report",
      subject: email.subject,
      body_text: email.text,
      body_html: email.html,
      related_entity_type: "franchise_subscription",
      related_entity_id: row.id,
    });
    await db
      .prepare(
        `INSERT OR IGNORE INTO premium_annual_reports (
           id, subscription_id, franchise_id, user_id, period_start_at, period_end_at,
           listing_views, saves, inquiries, contact_clicks, leads, queued_email_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `premium_report_${randomId()}`,
        row.id,
        row.franchise_id,
        row.user_id,
        row.starts_at,
        row.ends_at,
        metrics.listing_view,
        metrics.save,
        metrics.inquiry,
        metrics.contact_click,
        metrics.leads,
        emailId,
      )
      .run()
      .catch(() => null);
    if (emailId) queued += 1;
  }
  return queued;
}

export async function queuePremiumGraceEmails(db, settings = null) {
  const currentSettings = settings || await loadPremiumSettings(db);
  const graceDays = clampNumber(currentSettings.grace_period_days, 0, 30);
  if (graceDays <= 0) return 0;
  const rows = await safeAll(
    db,
    `SELECT
       s.id, s.franchise_id, s.user_id, s.ends_at,
       f.brand_name, f.slug,
       u.primary_email,
       CAST(julianday('now') - julianday(s.ends_at) AS INTEGER) + 1 AS grace_day
     FROM franchise_subscriptions s
     JOIN franchises f ON f.id = s.franchise_id
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.status = 'active'
       AND s.ends_at <= CURRENT_TIMESTAMP
       AND s.ends_at > datetime('now', ?)
       AND COALESCE(u.primary_email, '') != ''
     ORDER BY s.ends_at ASC
     LIMIT 50`,
    [`-${graceDays} days`],
  );

  let queued = 0;
  for (const row of rows) {
    const graceDay = Math.max(1, Math.min(Number(row.grace_day || 1), graceDays));
    const exists = await db
      .prepare(
        `SELECT id
         FROM premium_grace_notifications
         WHERE subscription_id = ? AND grace_day = ?
         LIMIT 1`,
      )
      .bind(row.id, graceDay)
      .first()
      .catch(() => null);
    if (exists) continue;

    const remaining = Math.max(0, graceDays - graceDay + 1);
    const email = graceEmail(row, remaining, graceDays);
    const emailId = await queueNotificationEmail(db, {
      user_id: row.user_id,
      to_email: row.primary_email,
      category: "premium_grace_period",
      subject: email.subject,
      body_text: email.text,
      body_html: email.html,
      related_entity_type: "franchise_subscription",
      related_entity_id: row.id,
    });
    if (!emailId) continue;

    await Promise.all([
      db
        .prepare(
          `INSERT INTO premium_grace_notifications (
             id, subscription_id, franchise_id, user_id, grace_day, queued_email_id
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(`premium_grace_${randomId()}`, row.id, row.franchise_id, row.user_id, graceDay, emailId)
        .run()
        .catch(() => null),
      createPremiumNotification(db, {
        user_id: row.user_id,
        franchise_id: row.franchise_id,
        notification_type: "premium_expiring",
        title: "Premium masuk masa tenggang",
        message: `${row.brand_name || "Listing"} akan kembali menjadi Free dalam ${remaining} hari bila belum diperpanjang.`,
        action_url: "/profil/?tab=membership",
      }),
    ]);
    queued += 1;
  }
  return queued;
}

export async function expirePremiumAfterGrace(db, settings = null) {
  const currentSettings = settings || await loadPremiumSettings(db);
  const graceDays = clampNumber(currentSettings.grace_period_days, 0, 30);
  const rows = await safeAll(
    db,
    `SELECT
       s.id, s.franchise_id, s.user_id, s.ends_at,
       f.brand_name, f.slug
     FROM franchise_subscriptions s
     JOIN franchises f ON f.id = s.franchise_id
     WHERE s.status = 'active'
       AND s.ends_at <= datetime('now', ?)
     ORDER BY s.ends_at ASC
     LIMIT 50`,
    [`-${graceDays} days`],
  );

  let expired = 0;
  let deferred = 0;

  for (const row of rows) {
    // Both lookups happen BEFORE anything is mutated, and neither is allowed to fail open. They used to be
    // `.catch(() => null)`, which is indistinguishable from "no other subscription exists" — so a single failed
    // query could unpublish a brand that still had a live subscription, and downgrade a paying member whose
    // second brand was still active. A failure now defers the row: it stays `active` and eligible, so the next
    // run repeats the whole decision instead of acting on a guess.
    let hasReplacement;
    let stillSubscribed;
    try {
      hasReplacement = await db
        .prepare(
          `SELECT id
           FROM franchise_subscriptions
           WHERE franchise_id = ?
             AND id != ?
             AND status = 'active'
             AND ends_at > CURRENT_TIMESTAMP
           LIMIT 1`,
        )
        .bind(row.franchise_id, row.id)
        .first();

      // This row cannot match its own query: its ends_at is already past. So asking before the update is the same
      // question as asking after it, which is what makes moving the decision ahead of the mutation safe.
      stillSubscribed = await db
        .prepare(
          `SELECT id FROM franchise_subscriptions
           WHERE user_id = ?
             AND status = 'active'
             AND ends_at > CURRENT_TIMESTAMP
           LIMIT 1`,
        )
        .bind(row.user_id)
        .first();
    } catch (error) {
      // Recorded rather than swallowed: a deferred row is a row that did not expire, and silence about that is
      // exactly how the previous fail-open went unnoticed.
      await auditStatement(db, "premium.subscription.expire.deferred", "franchise_subscriptions", row.id, {
        franchise_id: row.franchise_id,
        brand_name: row.brand_name,
        reason: String((error && error.message) || error || "lookup failed").slice(0, 300),
      }).run();
      deferred += 1;
      continue;
    }

    const statements = [
      db
        .prepare(
          `UPDATE franchise_subscriptions
           SET status = 'expired',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'active'`,
        )
        .bind(row.id),
      auditStatement(db, "premium.subscription.expire", "franchise_subscriptions", row.id, {
        franchise_id: row.franchise_id,
        brand_name: row.brand_name,
        grace_period_days: graceDays,
      }),
    ];

    if (!hasReplacement) {
      // Free listings remain available on Franchisee.id after Premium expires.
      // This is a network product rule, not the identity of the worker's host site.
      const networkSiteIds = PREMIUM_NETWORK_SITE_IDS.filter((siteId) => siteId !== "site_franchisee_id");
      const placeholders = networkSiteIds.map(() => "?").join(", ");
      statements.push(
        db
          .prepare(
            `UPDATE franchises
             SET verification_tier = CASE WHEN verification_tier = 'premium' THEN 'free' ELSE verification_tier END,
                 status = CASE WHEN status = 'premium' THEN 'free' ELSE status END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          )
          .bind(row.franchise_id),
      );
      if (networkSiteIds.length) {
        statements.push(
          db
            .prepare(
              `UPDATE franchise_site_publications
               SET publication_status = 'hidden',
                   updated_at = CURRENT_TIMESTAMP
               WHERE franchise_id = ?
                 AND site_id IN (${placeholders})`,
            )
            .bind(row.franchise_id, ...networkSiteIds),
        );
      }
      statements.push(
        ...PREMIUM_NETWORK_SITE_IDS.flatMap((siteId) => siteRebuildStatements(db, {
          siteId,
          franchiseId: row.franchise_id,
          reason: "premium_grace_expired",
          entityType: "franchise_subscriptions",
          entityId: row.id,
          actorUserId: null,
          source: "premium_email_worker",
          metadata: { brand_name: row.brand_name, grace_period_days: graceDays },
        })),
      );
    }

    // The membership decision commits with the expiry, not after it. Before, it was a separate write following
    // the batch, so a failure in between left a lapsed subscription with a timeline that still said premium — and
    // a retry could then append a second downgrade. Now either both land or neither does, so a retry after a
    // partial failure still produces exactly one effective `free` transition.
    if (!stillSubscribed) {
      statements.push(
        membershipEventStatement(db, {
          userId: row.user_id,
          status: "free",
          reason: "expired",
          siteId: SITE_FRANCHISOR_ID,
        }),
      );
    }

    await db.batch(statements);
    expired += 1;
  }

  if (deferred > 0) {
    await auditStatement(db, "premium.subscription.expire.deferred_summary", "franchise_subscriptions", null, {
      deferred,
      processed: rows.length,
    }).run();
  }

  return expired;
}

async function loadAnnualReportMetrics(db, row) {
  const metrics = {
    listing_view: 0,
    save: 0,
    inquiry: 0,
    contact_click: 0,
    leads: 0,
  };
  const eventRows = await safeAll(
    db,
    `SELECT event_type, COUNT(*) AS count
     FROM franchise_product_events
     WHERE franchise_id = ?
       AND created_at >= ?
       AND created_at <= ?
     GROUP BY event_type`,
    [row.franchise_id, row.starts_at, row.ends_at],
  );
  for (const item of eventRows) {
    if (item.event_type in metrics) metrics[item.event_type] = Number(item.count || 0);
  }
  const lead = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM franchise_leads
       WHERE franchise_id = ?
         AND created_at >= ?
         AND created_at <= ?`,
    )
    .bind(row.franchise_id, row.starts_at, row.ends_at)
    .first()
    .catch(() => null);
  metrics.leads = Number(lead?.count || 0);
  return metrics;
}

function annualReportEmail(row, metrics) {
  const brandName = row.brand_name || "Listing Anda";
  const subject = `Laporan tahunan Premium ${brandName}`;
  const lines = [
    `Laporan tahunan Premium ${brandName}.`,
    `Periode: ${formatDate(row.starts_at)} - ${formatDate(row.ends_at)}.`,
    `Dilihat: ${metrics.listing_view}. Disimpan: ${metrics.save}. Inquiry: ${metrics.inquiry}. Klik kontak: ${metrics.contact_click}. Leads: ${metrics.leads}.`,
    "Buka profil untuk memperpanjang atau melihat status membership: https://franchisor.id/profil/?tab=membership",
  ];
  const html = [
    `<p>Laporan tahunan Premium <strong>${escapeHtml(brandName)}</strong>.</p>`,
    `<p>Periode: ${escapeHtml(formatDate(row.starts_at))} - ${escapeHtml(formatDate(row.ends_at))}.</p>`,
    "<ul>",
    `<li>Dilihat: ${Number(metrics.listing_view || 0)}</li>`,
    `<li>Disimpan: ${Number(metrics.save || 0)}</li>`,
    `<li>Inquiry: ${Number(metrics.inquiry || 0)}</li>`,
    `<li>Klik kontak: ${Number(metrics.contact_click || 0)}</li>`,
    `<li>Leads: ${Number(metrics.leads || 0)}</li>`,
    "</ul>",
    '<p><a href="https://franchisor.id/profil/?tab=membership">Buka Membership</a></p>',
  ].join("");
  return { subject, text: lines.join(" "), html };
}

function graceEmail(row, remainingDays, graceDays) {
  const brandName = row.brand_name || "Listing Anda";
  const subject = `Premium ${brandName} masuk masa tenggang`;
  const remainingText = remainingDays > 0 ? `${remainingDays} hari` : "hari ini";
  const text = [
    `Premium ${brandName} sudah berakhir dan sedang berada dalam masa tenggang ${graceDays} hari.`,
    `Listing akan kembali menjadi Free dalam ${remainingText} bila belum diperpanjang.`,
    "Perpanjang dari profil: https://franchisor.id/profil/?tab=membership",
  ].join(" ");
  const html = [
    `<p>Premium <strong>${escapeHtml(brandName)}</strong> sudah berakhir dan sedang berada dalam masa tenggang ${Number(graceDays)} hari.</p>`,
    `<p>Listing akan kembali menjadi Free dalam <strong>${escapeHtml(remainingText)}</strong> bila belum diperpanjang.</p>`,
    '<p><a href="https://franchisor.id/profil/?tab=membership">Perpanjang Premium</a></p>',
  ].join("");
  return { subject, text, html };
}

function reminderTypeForDays(daysLeft) {
  if (!Number.isFinite(daysLeft) || daysLeft < 0 || daysLeft > PREMIUM_EXPIRING_LOOKAHEAD_DAYS) return null;
  return PREMIUM_REMINDER_TYPES.find((reminder) => daysLeft <= reminder.maxDays) || null;
}

function auditStatement(db, action, entityType, entityId, metadata = {}) {
  return db
    .prepare(
      `INSERT INTO audit_events (id, actor_user_id, source_site_id, action, entity_type, entity_id, metadata)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    )
    .bind(`audit_${randomId()}`, SITE_FRANCHISOR_ID, action, entityType, entityId || null, JSON.stringify(metadata || {}));
}
