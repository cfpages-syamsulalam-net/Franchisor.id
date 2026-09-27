import {
  authErrorResponse,
  requireD1User,
} from "./_clerk-auth.js";
import { addPublicRole, deleteAccount, updateAccount } from "./_profile-account.js";
import { removeOwnedBrand, updateFranchiseLeadStatus, updateFranchisorProfile, updateListingLocations, updateOwnedListing } from "./_profile-franchisor-actions.js";
import {
  createFranchiseInquiry,
  removeFranchiseOpportunity,
  saveFranchiseOpportunity,
  updateFranchiseeProfile,
} from "./_profile-franchisee-actions.js";
import { confirmPremiumPayment, createPremiumOrder } from "./_profile-premium.js";
import { loadProfileData, profileLoaders } from "./_profile-read-model.js";
import { MutationSchema } from "./_profile-schemas.js";
import { getDb, jsonResponse, validationError } from "./_profile-utils.js";
import { logOperationEvent } from "./_telemetry.js";

export async function onRequestPut() {
  return methodNotAllowedResponse();
}

export async function onRequestPatch() {
  return methodNotAllowedResponse();
}

export async function onRequestDelete() {
  return methodNotAllowedResponse();
}

export async function onRequestGet({ request, env }) {
  try {
    const db = getDb(env);
    const actor = await requireD1User(request, env, db);
    const data = await loadProfileData(db, actor);
    return jsonResponse({ success: true, ...data });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    await logOperationEvent(env.franchise_db, {
      eventType: "api.profile.get.failed",
      severity: "error",
      route: "/profile-data",
      message: error.message,
    });
    return jsonResponse({ success: false, message: error.message || "Profil gagal dimuat." }, { status: 500 });
  }
}

function methodNotAllowedResponse() {
  return jsonResponse(
    {
      success: false,
      error: "METHOD_NOT_ALLOWED",
      message: "Permintaan profil tidak dikenali. Muat ulang halaman lalu coba lagi.",
    },
    { status: 405, headers: { Allow: "GET, POST" } },
  );
}

export async function onRequestPost({ request, env }) {
  try {
    const db = getDb(env);
    const actor = await requireD1User(request, env, db);
    const raw = await request.json();
    const parsed = MutationSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);

    if (parsed.data.action === "update_account") {
      return await updateAccount(env, db, actor, parsed.data);
    }
    if (parsed.data.action === "update_franchisee_profile") {
      return await updateFranchiseeProfile(db, actor, parsed.data, profileLoaders);
    }
    if (parsed.data.action === "update_franchisor_profile") {
      return await updateFranchisorProfile(db, actor, parsed.data);
    }
    if (parsed.data.action === "update_listing") {
      return await updateOwnedListing(db, actor, parsed.data);
    }
    if (parsed.data.action === "delete_account") {
      return await deleteAccount(env, db, actor, parsed.data);
    }
    if (parsed.data.action === "remove_brand") {
      return await removeOwnedBrand(db, actor, parsed.data);
    }
    if (parsed.data.action === "update_listing_locations") {
      return await updateListingLocations(db, actor, parsed.data);
    }
    if (parsed.data.action === "add_public_role") {
      return await addPublicRole(env, db, actor, parsed.data, loadProfileData);
    }
    if (parsed.data.action === "create_franchise_inquiry") {
      return await createFranchiseInquiry(db, actor, parsed.data, profileLoaders);
    }
    if (parsed.data.action === "save_franchise_opportunity") {
      return await saveFranchiseOpportunity(db, actor, parsed.data, profileLoaders);
    }
    if (parsed.data.action === "remove_franchise_opportunity") {
      return await removeFranchiseOpportunity(db, actor, parsed.data, profileLoaders);
    }
    if (parsed.data.action === "update_franchise_lead_status") {
      return await updateFranchiseLeadStatus(db, actor, parsed.data);
    }
    if (parsed.data.action === "create_premium_order") {
      return await createPremiumOrder(db, actor, parsed.data);
    }
    if (parsed.data.action === "confirm_premium_payment") {
      return await confirmPremiumPayment(db, actor, parsed.data);
    }

    return jsonResponse({ success: false, message: "Aksi profil tidak dikenali." }, { status: 400 });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    await logOperationEvent(env.franchise_db, {
      eventType: "api.profile.post.failed",
      severity: "error",
      route: "/profile-data",
      message: error.message,
    });
    return jsonResponse({ success: false, message: error.message || "Perubahan profil gagal disimpan." }, { status: 500 });
  }
}
