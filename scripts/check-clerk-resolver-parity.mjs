#!/usr/bin/env node

/**
 * Cross-repo parity check for the Clerk identity resolver.
 *
 * `functions/_clerk-auth.js` exists as two hand-maintained copies, one per site, and they have already drifted
 * once in a way that mattered: Franchisor.id forced `status = 'active'` on both existing-row paths while
 * Franchisee.id preserved it, so a suspended or deleted account could reinstate itself — roles and email role
 * grants included — just by signing in on the other site. Nothing caught it, because no check compared the
 * copies.
 *
 * This walks that back. It compares the `upsertD1User` bodies of the network repositories after normalising
 * away comments and formatting, and separately asserts the invariant that actually caused the incident: an
 * UPDATE against an existing users row must never write `status`.
 *
 * The sibling checkout may be absent, as it is inside a Cloudflare Pages build sandbox. That is a SKIP, not a
 * pass, and it says so — the same convention `schema:check` uses.
 *
 * Deliberately identical in both repositories: the sibling list is explicit, so neither copy needs to know
 * which repository it lives in.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESOLVER_RELATIVE_PATH = join("functions", "_clerk-auth.js");
const OWN = join(ROOT, RESOLVER_RELATIVE_PATH);

// Both known network repositories. Whichever one this script is running inside is excluded below.
const NETWORK_RESOLVERS = [
  join(ROOT, "..", "Franchisee.id", RESOLVER_RELATIVE_PATH),
  join(ROOT, "..", "Franchisor.id", RESOLVER_RELATIVE_PATH),
];

const FUNCTION_NAME = "upsertD1User";

if (!existsSync(OWN)) {
  console.error(`Clerk resolver parity check expected ${OWN}.`);
  process.exit(1);
}

const siblings = NETWORK_RESOLVERS
  .map((path) => resolve(path))
  .filter((path) => path !== resolve(OWN))
  .filter((path) => existsSync(path));

if (siblings.length === 0) {
  console.log(
    "SKIP clerk resolver parity check: no sibling network checkout found beside this repository " +
      "(a skip is not a pass). Run it where both repositories are present."
  );
  process.exit(0);
}

const ownSource = readFileSync(OWN, "utf8");
const ownBody = extractFunction(ownSource, FUNCTION_NAME, OWN);
const ownNormalized = normalize(ownBody);
const ownExports = exportedNames(ownSource);

let failed = false;

assertStatusIsNeverOverwritten(OWN, ownNormalized);

for (const sibling of siblings) {
  const siblingSource = readFileSync(sibling, "utf8");
  const siblingBody = extractFunction(siblingSource, FUNCTION_NAME, sibling);
  const siblingNormalized = normalize(siblingBody);

  assertStatusIsNeverOverwritten(sibling, siblingNormalized);

  // The exported surface matters as much as the resolver body: Franchisee.id exported `assertActiveD1User`
  // and called it on both authenticated paths, while Franchisor.id had neither the function nor the calls, so
  // its suspended accounts were never rejected. Nothing compared the surfaces, so nothing noticed.
  const exportFinding = compareExports(ownExports, exportedNames(siblingSource), sibling);
  if (exportFinding) {
    failed = true;
    console.error(exportFinding);
  }

  if (ownNormalized === siblingNormalized) {
    console.log(`  ${FUNCTION_NAME} matches ${shortName(sibling)} (${ownNormalized.length} normalised chars)`);
    continue;
  }

  failed = true;
  const { index, ownExcerpt, siblingExcerpt } = firstDivergence(ownNormalized, siblingNormalized);
  console.error(`Clerk resolver parity check: ${FUNCTION_NAME} diverged from ${shortName(sibling)}.`);
  console.error(`  first difference at normalised index ${index}`);
  console.error(`  this repository : ${ownExcerpt}`);
  console.error(`  ${shortName(sibling)} : ${siblingExcerpt}`);
  console.error("  The two copies must stay equivalent; fix both or extract the shared logic.");
}

if (failed) process.exit(1);

console.log(
  `Clerk resolver parity check passed: ${FUNCTION_NAME} equivalent to ${siblings.length} sibling copy/ies, ` +
    `${ownExports.length} exported names agree, and no existing-row UPDATE writes status.`
);

/** Every top-level name the module exports, sorted, so the two copies can be compared as sets. */
function exportedNames(source) {
  const names = new Set();
  const pattern = /^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/gm;
  let match;
  while ((match = pattern.exec(source))) names.add(match[1]);
  return [...names].sort();
}

function compareExports(ownNames, siblingNames, sibling) {
  const missing = ownNames.filter((name) => !siblingNames.includes(name));
  const extra = siblingNames.filter((name) => !ownNames.includes(name));
  if (missing.length === 0 && extra.length === 0) return null;
  const lines = [
    `Clerk resolver parity check: the exported surface differs from ${shortName(sibling)}.`,
    `  ${shortName(sibling)} exports ${siblingNames.length} names, this repository exports ${ownNames.length}.`,
  ];
  if (missing.length) lines.push(`  only in this repository : ${missing.join(", ")}`);
  if (extra.length) lines.push(`  only in ${shortName(sibling)} : ${extra.join(", ")}`);
  lines.push("  The two copies must expose the same surface; a missing guard is an authorization gap.");
  return lines.join("\n");
}

function extractFunction(source, name, label) {
  const signature = `export async function ${name}(`;
  const start = source.indexOf(signature);
  if (start === -1) {
    console.error(`Clerk resolver parity check could not find ${signature} in ${label}.`);
    process.exit(1);
  }
  const end = source.indexOf("\n}\n", start);
  if (end === -1) {
    console.error(`Clerk resolver parity check could not find the end of ${name} in ${label}.`);
    process.exit(1);
  }
  return source.slice(start, end + 2);
}

function normalize(body) {
  return body
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}();,=<>+?`])\s*/g, "$1")
    .trim();
}

// The incident invariant: resolution may insert a new active row, but it must never overwrite the status of a
// row that already exists. Whichever site a person signs in through, suspension stays an administrator's call.
function assertStatusIsNeverOverwritten(label, normalizedBody) {
  const violations = [];
  const updatePattern = /UPDATE users SET([^`]*)/g;
  let match;
  while ((match = updatePattern.exec(normalizedBody))) {
    const assignment = match[1];
    if (/status='active'/.test(assignment)) violations.push(assignment.trim());
  }

  if (violations.length > 0) {
    console.error(`Clerk resolver parity check: ${shortName(label)} writes status on an existing users row.`);
    for (const violation of violations) console.error(`  UPDATE users SET ${violation}`);
    console.error("  A successful sign-in must not reinstate a suspended or deleted account.");
    process.exit(1);
  }
}

function firstDivergence(a, b) {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return {
    index,
    ownExcerpt: `...${a.slice(Math.max(0, index - 60), index + 120)}`,
    siblingExcerpt: `...${b.slice(Math.max(0, index - 60), index + 120)}`,
  };
}

function shortName(path) {
  const parts = path.split(/[\\/]/);
  const rootIndex = parts.lastIndexOf(ROOT.split(/[\\/]/).pop());
  return rootIndex > 0 ? parts.slice(rootIndex - 1).join("/") : path;
}
