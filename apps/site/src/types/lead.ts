export interface Lead {
  id?: string;
  name: string;
  company: string;
  email: string;
  phone?: string;
  revenue?: string;
  message?: string;
  source: "website_form" | "linkedin" | "referral" | "cold_email";
  status: "new" | "contacted" | "qualified" | "proposal" | "closed_won" | "closed_lost";
  created_at?: string;
}

export interface LeadFormData {
  name: string;
  company: string;
  email: string;
  phone: string;
  revenue: string;
  message: string;
}
