import { connectMongo, getCollection, Collections, type OrganizationDoc, type IndustryProfileDoc } from "@pipeline/shared/db";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME ?? "linkedin_pipeline";

export interface TenantContext {
  tenantId: string;
  orgName: string;
  publishingTargets: string[];
  verticalName?: string;
  logoUrl?: string;
  colorPalette: string[];
}

/**
 * Резолвит контекст портала по tenantId из URL (см. app/(dashboard)/[tenantId]).
 * Каждый портал (tech, testo, и любой будущий клиент) — это отдельный tenantId,
 * строго изолированный на уровне данных: ничего не возвращается без явного совпадения tenantId.
 * Возвращает null, если Organization с таким tenantId не существует — тогда layout должен отдать 404,
 * чтобы нельзя было зайти в чужой/несуществующий портал по URL.
 */
export async function getTenantContext(tenantId: string): Promise<TenantContext | null> {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);

  const org = await getCollection<OrganizationDoc>(Collections.ORGANIZATIONS).findOne({ tenantId });
  if (!org) return null;

  const industryProfile = await getCollection<IndustryProfileDoc>(Collections.INDUSTRY_PROFILES).findOne({ tenantId });

  return {
    tenantId: org.tenantId,
    orgName: org.name,
    publishingTargets: org.publishingTargets,
    verticalName: industryProfile?.verticalName,
    logoUrl: industryProfile?.brandGuidelines?.logoUrl,
    colorPalette: industryProfile?.brandGuidelines?.colorPalette ?? [],
  };
}

/** Список всех порталов (для страницы-picker'а на /portal). */
export async function listTenants(): Promise<TenantContext[]> {
  await connectMongo(MONGO_URI, MONGO_DB_NAME);
  const orgs = await getCollection<OrganizationDoc>(Collections.ORGANIZATIONS).find({}).toArray();
  const profiles = await getCollection<IndustryProfileDoc>(Collections.INDUSTRY_PROFILES).find({}).toArray();
  const profileByTenant = new Map(profiles.map((p) => [p.tenantId, p]));

  return orgs.map((org) => {
    const profile = profileByTenant.get(org.tenantId);
    return {
      tenantId: org.tenantId,
      orgName: org.name,
      publishingTargets: org.publishingTargets,
      verticalName: profile?.verticalName,
      logoUrl: profile?.brandGuidelines?.logoUrl,
      colorPalette: profile?.brandGuidelines?.colorPalette ?? [],
    };
  });
}
