export interface VendorRuleDefinition {
  id: string;
  vendorId: string;
  vendorVariantId: string | null;
  ruleType: "exact_code" | "alias" | "regex" | "normalized_text" | "stamp_pattern";
  pattern: string;
  priority: number;
  confidenceWeight: number;
  description?: string | null;
  isActive: boolean;
}

export interface VendorVariantData {
  id: string;
  vendorId: string;
  name: string;
  code: string;
  displayTechnology?: string | null;
}

export interface VendorData {
  id: string;
  name: string;
  code: string;
  aliases: string[];
}

export interface VendorMatchResult {
  vendorId: string | null;
  vendorName: string | null;
  vendorVariantId: string | null;
  vendorVariantName: string | null;
  matchedRuleId: string | null;
  matchedPattern: string | null;
  confidenceScore: number;
  matchStatus: "exact_match" | "strong_candidate" | "ambiguous" | "unknown";
  evidenceNotes: string[];
  candidateAlternatives: Array<{
    vendorId: string;
    vendorName: string;
    variantId?: string | null;
    variantName?: string | null;
    score: number;
  }>;
}
