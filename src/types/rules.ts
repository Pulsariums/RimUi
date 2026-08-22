export interface CommunityRule {
  package_id: string;
  weight: number;
}

export interface CommunityRules {
  rules: CommunityRule[];
}
