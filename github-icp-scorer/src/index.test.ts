import { describe, it, expect } from "vitest";
import {
  scoreICP,
  createCustomScorer,
  batchScore,
  filterQualified,
  filterHot,
  sortByScore,
  type Lead,
} from "./index";

describe("ICP Scorer", () => {
  describe("scoreICP", () => {
    it("should score a qualified B2B lead", () => {
      const lead: Lead = {
        name: "Sarah Chen",
        company: "TechScale Agency",
        email: "sarah@techscale.com",
        phone: "+91 98765 43210",
        revenue: "5-20L",
        message:
          "We're a B2B SaaS agency looking to scale our SDR team. Interested in how JARVIS can help.",
      };

      const result = scoreICP(lead);

      expect(result.score).toBeGreaterThanOrEqual(15);
      expect(result.qualified).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it("should identify hot leads", () => {
      const lead: Lead = {
        name: "Raj Patel",
        company: "SaaS Outbound Agency",
        revenue: "20L+",
        message:
          "We need help with lead generation and cold email outreach. Our team is looking to scale sales pipeline.",
        phone: "+91 98765 43210",
      };

      const result = scoreICP(lead);

      expect(result.score).toBeGreaterThanOrEqual(20);
      expect(result.hot).toBe(true);
    });

    it("should disqualify non-ICP leads", () => {
      const lead: Lead = {
        name: "Student Dev",
        company: "College Coding Club",
        message: "I'm learning web development and interested in your platform.",
      };

      const result = scoreICP(lead);

      expect(result.qualified).toBe(false);
      expect(result.reasons.some((r) => r.includes("Disqualified"))).toBe(
        true
      );
    });

    it("should score based on revenue tier", () => {
      const leads = [
        { revenue: "0-1L" as const, message: "sales agency", company: "agency" },
        { revenue: "1-5L" as const, message: "sales agency", company: "agency" },
        { revenue: "5-20L" as const, message: "sales agency", company: "agency" },
        { revenue: "20L+" as const, message: "sales agency", company: "agency" },
      ];

      const scores = leads.map((l) => scoreICP(l).score);

      // Higher revenue should score higher
      expect(scores[3]).toBeGreaterThan(scores[2]);
      expect(scores[2]).toBeGreaterThan(scores[1]);
      expect(scores[1]).toBeGreaterThan(scores[0]);
    });

    it("should award points for phone number", () => {
      const withPhone: Lead = {
        company: "sales agency",
        message: "interested",
        phone: "+91 9876543210",
      };

      const withoutPhone: Lead = {
        company: "sales agency",
        message: "interested",
      };

      const scoreWith = scoreICP(withPhone).score;
      const scoreWithout = scoreICP(withoutPhone).score;

      expect(scoreWith).toBeGreaterThan(scoreWithout);
      expect(scoreWith - scoreWithout).toBe(2); // Phone is +2
    });

    it("should award points for detailed message", () => {
      const detailed: Lead = {
        company: "sales agency",
        message:
          "We are looking for outbound sales automation solutions to scale our lead generation efforts.",
      };

      const brief: Lead = {
        company: "sales agency",
        message: "interested",
      };

      const scoreDetailed = scoreICP(detailed).score;
      const scoreBrief = scoreICP(brief).score;

      expect(scoreDetailed).toBeGreaterThan(scoreBrief);
    });

    it("should handle empty leads", () => {
      const emptyLead: Lead = {};
      const result = scoreICP(emptyLead);

      expect(result.score).toBe(0);
      expect(result.qualified).toBe(false);
      expect(result.hot).toBe(false);
    });
  });

  describe("Custom Scorers", () => {
    it("should allow custom keywords", () => {
      const customScorer = createCustomScorer({
        hotKeywords: ["enterprise", "consulting"],
        disqualifyKeywords: ["student", "freelance"],
      });

      const lead: Lead = {
        company: "Enterprise Corp",
        message: "We're an enterprise consulting firm",
      };

      const result = customScorer(lead);
      expect(result.qualified).toBe(true);
    });

    it("should allow custom revenue scores", () => {
      const customScorer = createCustomScorer({
        revenueScores: {
          "0-1L": 0, // Low value tier gets no points
          "1-5L": 3,
          "5-20L": 6,
          "20L+": 12, // High value tier worth more
        },
      });

      const highRevenue: Lead = {
        revenue: "20L+",
        company: "agency",
        message: "sales",
      };

      const result = customScorer(highRevenue);
      expect(result.score).toBeGreaterThan(12); // Should include revenue points
    });
  });

  describe("Batch Operations", () => {
    const testLeads: Lead[] = [
      {
        name: "Lead 1",
        company: "Sales Agency",
        revenue: "5-20L",
        message: "Looking for lead generation help",
        phone: "+91 9876543210",
      },
      {
        name: "Lead 2",
        company: "Student Club",
        message: "Learning about sales",
      },
      {
        name: "Lead 3",
        company: "B2B SaaS",
        revenue: "20L+",
        message: "Need outbound automation for our sales team",
      },
    ];

    it("should batch score leads", () => {
      const results = batchScore(testLeads);

      expect(results.length).toBe(3);
      expect(results[0].score).toBeDefined();
      expect(results[1].score).toBeDefined();
      expect(results[2].score).toBeDefined();
    });

    it("should filter qualified leads", () => {
      const results = batchScore(testLeads);
      const qualified = filterQualified(results);

      expect(qualified.length).toBeLessThan(results.length);
      expect(qualified.every((l) => l.qualified)).toBe(true);
    });

    it("should filter hot leads", () => {
      const results = batchScore(testLeads);
      const hot = filterHot(results);

      expect(hot.every((l) => l.hot)).toBe(true);
      expect(hot.every((l) => l.score >= 20)).toBe(true);
    });

    it("should sort by score", () => {
      const results = batchScore(testLeads);
      const sorted = sortByScore(results);

      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].score).toBeGreaterThanOrEqual(sorted[i].score);
      }
    });
  });

  describe("Real-world scenarios", () => {
    it("should handle a freelancer with low fit", () => {
      const lead: Lead = {
        name: "Freelance Dev",
        company: "Solo Freelancer",
        message: "I do web development as a freelancer",
      };

      const result = scoreICP(lead);
      expect(result.qualified).toBe(false);
    });

    it("should recognize high-fit agency prospect", () => {
      const lead: Lead = {
        name: "Priya Sharma",
        company: "GrowthScale Marketing",
        email: "priya@growthscale.com",
        phone: "+91 98765 43210",
        revenue: "5-20L",
        message:
          "We're an agency specializing in B2B lead generation for SaaS. Looking to scale our outbound operations and replace expensive SDR hires.",
      };

      const result = scoreICP(lead);

      expect(result.score).toBeGreaterThanOrEqual(20);
      expect(result.hot).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(2);
    });

    it("should handle multi-keyword matching", () => {
      const lead: Lead = {
        company: "B2B SaaS Agency",
        message:
          "We handle outbound sales automation, cold email prospecting, and LinkedIn lead generation for agencies",
      };

      const result = scoreICP(lead);

      // Should detect multiple keywords
      expect(result.reasons.some((r) => r.includes("matches"))).toBe(true);
      const matchesReason = result.reasons.find((r) => r.includes("matches"));
      expect(matchesReason).toMatch(/\(\d+ matches\)/);
    });
  });
});
