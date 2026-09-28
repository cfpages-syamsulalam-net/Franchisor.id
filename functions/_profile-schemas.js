import { z } from "zod";
import { ConfirmPremiumPaymentSchema, CreatePremiumOrderSchema } from "./_profile-premium.js";

/**
 * The consent versions the server currently accepts. These must match the constants on the delete-account page
 * (`src/pages/pengaturan/hapus-akun/index.astro`): when the consequence text or the contract changes, bump all
 * three together — the page and both literals here — or the page's own submissions start failing validation.
 */
export const CURRENT_ACKNOWLEDGEMENT_VERSION = "2026-09-28.1";
export const CURRENT_CONTRACT_VERSION = "2026-09-28.1";

const AccountSchema = z.object({
  action: z.literal("update_account"),
  display_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
});

const FranchiseeProfileSchema = z.object({
  action: z.literal("update_franchisee_profile"),
  country_code: optionalText(12),
  whatsapp: optionalText(40),
  city_origin: optionalText(120),
  interest_category: optionalText(120),
  budget_range: optionalText(120),
  location_plan: optionalText(120),
  message: optionalText(1200),
});

const FranchisorProfileSchema = z.object({
  action: z.literal("update_franchisor_profile"),
  company_name: optionalText(180),
  country_code: optionalText(12),
  whatsapp: optionalText(40),
  website_url: optionalText(500),
  instagram_url: optionalText(500),
  facebook_url: optionalText(500),
  tiktok_url: optionalText(500),
  youtube_url: optionalText(500),
  linkedin_url: optionalText(500),
  nib_number: optionalText(32),
  haki_status: z.enum(["registered", "process", "none", ""]).optional(),
  haki_number: optionalText(80),
});

const ListingSchema = z.object({
  action: z.literal("update_listing"),
  franchise_id: z.string().trim().min(3).max(120),
  brand_name: optionalText(180),
  category: optionalText(120),
  year_established: optionalInt(),
  city_origin: optionalText(120),
  brand_country: optionalText(80),
  outlet_type: optionalText(120),
  target_market: optionalText(180),
  location_requirement: optionalText(240),
  min_area_sqm: optionalInt(),
  min_staff_count: optionalInt(),
  setup_duration_days: optionalInt(),
  rent_cost_text: optionalText(240),
  fee_license_idr: optionalMoney(),
  fee_capex_idr: optionalMoney(),
  fee_construction_idr: optionalMoney(),
  working_capital_idr: optionalMoney(),
  additional_cost_notes: optionalText(800),
  total_investment_idr: optionalMoney(),
  min_investment_idr: optionalMoney(),
  max_investment_idr: optionalMoney(),
  estimated_bep_months: optionalInt(),
  estimated_bep_min_months: optionalInt(),
  estimated_bep_max_months: optionalInt(),
  omzet_monthly_idr: optionalMoney(),
  omzet_monthly_min_idr: optionalMoney(),
  omzet_monthly_max_idr: optionalMoney(),
  net_profit_percent: optionalNumber(),
  net_profit_monthly_min_idr: optionalMoney(),
  net_profit_monthly_max_idr: optionalMoney(),
  royalty_percent: optionalNumber(),
  royalty_basis: optionalText(80),
  short_desc: optionalText(280),
  full_desc: optionalText(5000),
  support_system: optionalText(2000),
  phone: optionalText(80),
  office_address: optionalText(800),
  outlets_location: optionalText(800),
  logo_url: optionalText(500),
  cover_url: optionalText(500),
  gallery_urls: optionalText(2000),
  video_url: optionalText(500),
  proposal_url: optionalText(500),
});

const ListingLocationSchema = z.object({
  city: z.string().trim().min(2).max(100),
  province: optionalText(100),
  location_type: z.enum(["head_office", "outlet", "available_area", "origin"]).default("available_area"),
});

const ListingLocationsSchema = z.object({
  action: z.literal("update_listing_locations"),
  franchise_id: z.string().trim().min(3).max(120),
  locations: z.array(ListingLocationSchema).max(24).default([]),
});

const DeleteAccountSchema = z.object({
  action: z.literal("delete_account"),
  // The same literal the page tells the person to type, so a stray click or a replayed request cannot remove an
  // account. Normalised because the phrase contains spaces and people paste it.
  confirm: z.literal("HAPUS AKUN SAYA"),
  // Which consequence text was on screen. Stored on the block row so we can show what they agreed to. Bound to
  // the server-owned current version, not merely nonempty: a stale page or a direct request carrying a fabricated
  // version would otherwise record consent against text the person never saw.
  acknowledgement_version: z.literal(CURRENT_ACKNOWLEDGEMENT_VERSION),

  // The signed contract, required from everyone rather than only paid members: the wording covers both cases, and
  // a conditional requirement on the most destructive page in the application is exactly where the client and the
  // server would end up disagreeing about whether a signature is needed.
  contract_version: z.literal(CURRENT_CONTRACT_VERSION),
  signer_full_name: z.string().trim().min(3).max(120),
  signature_format: z.enum(["path/v1", "image/webp", "image/png"]),
  // The cap is the point. This is a retained-for-years artefact in a database with a hard 500 MB ceiling shared
  // with the whole network, so an unbounded payload is not an option — and a gesture encodes to well under a
  // kilobyte, which makes 8 000 characters generous rather than tight.
  signature_payload: z.string().trim().min(1).max(8000),
  signature_point_count: z.number().int().positive().max(512).optional(),
}).superRefine((data, context) => {
  // Structural validation for the gesture format, before any destructive statement runs. A `path/v1` payload is
  // width, height, then signed 16-bit deltas; the checks below are the decode failing loudly rather than the
  // erasure proceeding on evidence nothing can read. Raster formats travel opaque — the page verifies their prefix
  // client-side, and the server stores them as received.
  if (data.signature_format !== "path/v1") return;
  let buffer;
  try {
    buffer = Buffer.from(String(data.signature_payload || ""), "base64");
  } catch {
    buffer = null;
  }
  if (!buffer || buffer.length < 4 || (buffer.length - 4) % 4 !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "signature_payload is not a whole number of path/v1 points", path: ["signature_payload"] });
    return;
  }
  const width = buffer.readInt16LE(0);
  const height = buffer.readInt16LE(2);
  // Bounded because the renderer allocates width × height × 4 bytes: unbounded geometry is a memory-exhaustion
  // input wearing a signature's clothes. The page's canvas is a few hundred pixels a side; 2 000 is generous.
  if (width <= 0 || height <= 0 || width > 2000 || height > 2000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "signature_payload canvas size is not usable", path: ["signature_payload"] });
    return;
  }
  const points = (buffer.length - 4) / 4;
  if (points < 1 || points > 512) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "signature_payload holds no usable gesture", path: ["signature_payload"] });
    return;
  }
  if (data.signature_point_count != null && data.signature_point_count !== points) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "signature_point_count does not match the payload", path: ["signature_point_count"] });
  }
});

const AddPublicRoleSchema = z.object({
  action: z.literal("add_public_role"),
  role: z.enum(["franchisee", "franchisor"]),
});

const FranchiseInquirySchema = z.object({
  action: z.literal("create_franchise_inquiry"),
  franchise_id: z.string().trim().min(3).max(120),
  message: optionalText(1200),
  buyer_context: z.record(z.unknown()).optional().default({}),
});

const SaveOpportunitySchema = z.object({
  action: z.literal("save_franchise_opportunity"),
  franchise_id: z.string().trim().min(3).max(120),
  note: optionalText(500),
});

const RemoveOpportunitySchema = z.object({
  action: z.literal("remove_franchise_opportunity"),
  franchise_id: z.string().trim().min(3).max(120),
});

const LeadStatusSchema = z.object({
  action: z.literal("update_franchise_lead_status"),
  lead_id: z.string().trim().min(3).max(120),
  status: z.enum(["new", "sent", "viewed", "contacted", "qualified", "closed", "archived"]),
});

const RemoveBrandSchema = z.object({
  action: z.literal("remove_brand"),
  franchise_id: z.string().trim().min(3).max(120),
  reason_code: z.enum(["no_longer_offering", "bankrupt", "seasonal", "other"]),
  note: optionalText(500),
  // The client echoes this phrase back, so a stray click or a replayed request cannot delist a brand. It is the
  // same text the owner was shown on the consequence screen, which is why it is a literal rather than a flag.
  confirm: z.literal("HAPUS BRAND SAYA"),
});

export const MutationSchema = z.discriminatedUnion("action", [
  AccountSchema,
  FranchiseeProfileSchema,
  FranchisorProfileSchema,
  ListingSchema,
  ListingLocationsSchema,
  RemoveBrandSchema,
  DeleteAccountSchema,
  AddPublicRoleSchema,
  FranchiseInquirySchema,
  SaveOpportunitySchema,
  RemoveOpportunitySchema,
  LeadStatusSchema,
  CreatePremiumOrderSchema,
  ConfirmPremiumPaymentSchema,
]);

function optionalText(max) {
  return z.string().trim().max(max).optional().or(z.literal(""));
}

function optionalInt() {
  return z.preprocess((value) => (value === "" || value === null || value === undefined ? undefined : Number(value)), z.number().int().optional());
}

function optionalNumber() {
  return z.preprocess((value) => (value === "" || value === null || value === undefined ? undefined : Number(value)), z.number().optional());
}

function optionalMoney() {
  return z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    return Number(String(value).replace(/[^\d.-]/g, ""));
  }, z.number().int().optional());
}
