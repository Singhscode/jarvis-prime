#!/usr/bin/env node
/**
 * Extract production project reference from PHASE11_PRODUCTION_DATABASE_URL.
 * 
 * Usage (inside protected environment):
 *   PHASE11_PRODUCTION_DATABASE_URL="..." node extract-production-project-ref.mjs
 * 
 * Output format (to stdout):
 *   EXTRACTED_PROJECT_REF=<project-ref>
 * 
 * Does NOT print the URL, password, username, or any secret value.
 */

import url from 'url';

const databaseUrl = process.env.PHASE11_PRODUCTION_DATABASE_URL;

if (!databaseUrl) {
  console.error('Error: PHASE11_PRODUCTION_DATABASE_URL not set');
  process.exit(1);
}

try {
  // Parse the database URL to extract hostname
  const parsed = new url.URL(databaseUrl);
  const hostname = parsed.hostname;

  if (!hostname) {
    console.error('Error: Could not extract hostname from database URL');
    process.exit(1);
  }

  // Extract project reference from hostname.
  // Expected format: <project-ref>.supabase.co or <project-ref>.<region>.supabase.co
  // or direct: <project-ref>.db.supabase.co (session pooler: <project-ref>-pooler.supabase.co)
  const match = hostname.match(/^([a-z0-9]{20,})(?:\.|$)/);
  
  if (!match || !match[1]) {
    console.error('Error: Could not extract project reference from hostname');
    process.exit(1);
  }

  const projectRef = match[1];

  // Validate project reference format (typically 20-24 character alphanumeric lowercase)
  if (!/^[a-z0-9]{20,}$/.test(projectRef)) {
    console.error('Error: Extracted project reference does not match expected format');
    process.exit(1);
  }

  // Output ONLY the project reference, not the URL or any credentials
  console.log(`EXTRACTED_PROJECT_REF=${projectRef}`);
} catch (error) {
  console.error(`Error parsing database URL: ${error.message}`);
  process.exit(1);
}
