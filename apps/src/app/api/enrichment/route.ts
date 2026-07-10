/**
 * API Route: POST /api/enrichment
 * Triggers the prospect enrichment pipeline
 * Used by automation engine to pull and enrich leads from Apollo.io
 */

import { NextRequest, NextResponse } from "next/server";
import {
  runEnrichmentPipeline,
  findMarketingAgencyLeads,
  generateReport,
} from "@/lib/enrichment-pipeline";
import type { ApolloSearchParams } from "@/lib/apollo-client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, params, dry_run } = body;

    // Validate action
    if (!action) {
      return NextResponse.json(
        { error: "Missing action parameter" },
        { status: 400 }
      );
    }

    let result;

    switch (action) {
      case "search":
        /**
         * Search for prospects with custom parameters
         * Example: { action: "search", params: { keyword: "marketing agency", location: "India" } }
         */
        if (!params) {
          return NextResponse.json(
            { error: "Missing search parameters" },
            { status: 400 }
          );
        }

        result = await runEnrichmentPipeline(params as ApolloSearchParams, {
          dryRun: dry_run || false,
        });
        break;

      case "find_agencies":
        /**
         * Find marketing agency decision makers (pre-configured for JARVIS PRIME ICP)
         * Example: { action: "find_agencies", params: { location: "India", limit: 50 } }
         */
        result = await findMarketingAgencyLeads(
          params?.location,
          params?.limit || 50
        );
        break;

      case "enrich_batch":
        /**
         * Enrich a batch of prospects from search parameters
         * Example: { action: "enrich_batch", params: { keyword: "founder", industry: "marketing" } }
         */
        result = await runEnrichmentPipeline(params as ApolloSearchParams, {
          minICPScore: params?.min_icp_score || 50,
          minDataQuality: params?.min_quality || "medium",
          verifyEmails: params?.verify_emails || false,
          dryRun: dry_run || false,
        });
        break;

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    // Generate report if requested
    const report = params?.include_report ? generateReport(result) : null;

    return NextResponse.json(
      {
        success: result.success,
        data: {
          timestamp: result.timestamp,
          prospectCount: result.prospectCount,
          enrichedCount: result.enrichedCount,
          highQualityCount: result.highQualityCount,
          prospects: result.prospects,
          errors: result.errors,
        },
        report,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Enrichment API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/enrichment
 * Returns enrichment status and statistics
 */
export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      status: "ready",
      message: "Enrichment API is operational",
      endpoints: {
        search: "POST /api/enrichment { action: 'search', params: {...} }",
        find_agencies:
          "POST /api/enrichment { action: 'find_agencies', params: { location?: string, limit?: number } }",
        enrich_batch:
          "POST /api/enrichment { action: 'enrich_batch', params: {...} }",
      },
      apollo_configured: !!process.env.APOLLO_API_KEY,
    },
    { status: 200 }
  );
}
