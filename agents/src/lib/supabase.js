/**
 * JARVIS PRIME — Supabase Client
 * 
 * Connects to your Supabase database for lead storage and tracking.
 * 
 * SETUP:
 * 1. Create account at https://supabase.com
 * 2. Create new project
 * 3. Run the SQL schema (see /agents/schema.sql)
 * 4. Copy your URL and anon key to .env
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder-key"
);

// Helper functions for common operations
export async function getNewLeads(limit = 20) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(limit);
  
  if (error) throw new Error(`Failed to fetch leads: ${error.message}`);
  return data || [];
}

export async function updateLeadStatus(leadId, status, notes = "") {
  const { error } = await supabase
    .from("leads")
    .update({ status, notes, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  
  if (error) throw new Error(`Failed to update lead: ${error.message}`);
}

export async function logOutreach(leadId, channel, step, subject, body) {
  const { error } = await supabase
    .from("outreach_log")
    .insert({ lead_id: leadId, channel, step, subject, body });
  
  if (error) throw new Error(`Failed to log outreach: ${error.message}`);
}

export async function getLeadsByStatus(status) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });
  
  if (error) throw new Error(`Failed to fetch leads: ${error.message}`);
  return data || [];
}

export async function insertLead(lead) {
  const { data, error } = await supabase
    .from("leads")
    .insert(lead)
    .select()
    .single();
  
  if (error) throw new Error(`Failed to insert lead: ${error.message}`);
  return data;
}
