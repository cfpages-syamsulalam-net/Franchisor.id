import { z } from "zod";
import { ConfirmPremiumPaymentSchema, CreatePremiumOrderSchema } from "./_profile-premium.js";

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
