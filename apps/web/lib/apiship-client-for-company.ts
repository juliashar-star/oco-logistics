import {
  ApishipClient,
  ApishipError,
  createApishipClient,
  createApishipClientFromEnv,
} from "@oco/apiship";
import { prisma } from "@/lib/db";
import { decryptApishipPassword } from "@/lib/apiship-credentials";

type CompanyApishipFields = {
  apishipLogin: string | null;
  apishipPasswordEnc: string | null;
  apishipConnectedAt: Date | null;
};

export function hasEnvApishipCredentials(): boolean {
  return Boolean(
    process.env.APISHIP_BASE_URL &&
      process.env.APISHIP_LOGIN &&
      process.env.APISHIP_PASSWORD,
  );
}

/** Fallback на .env — только локальная разработка, не в бою. */
export function canUseEnvApishipFallback(): boolean {
  return process.env.NODE_ENV !== "production" && hasEnvApishipCredentials();
}

export function isCompanyApishipConnected(company: CompanyApishipFields): boolean {
  return Boolean(
    company.apishipConnectedAt &&
      company.apishipLogin &&
      company.apishipPasswordEnc,
  );
}

export function canUseApiship(company: CompanyApishipFields): boolean {
  return isCompanyApishipConnected(company) || canUseEnvApishipFallback();
}

export async function getApishipClientForCompany(
  companyId: string,
): Promise<ApishipClient> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      apishipLogin: true,
      apishipPasswordEnc: true,
      apishipConnectedAt: true,
    },
  });

  if (!company) {
    throw new ApishipError("Компания не найдена");
  }

  const baseUrl = process.env.APISHIP_BASE_URL;
  if (!baseUrl) {
    throw new ApishipError("APIShip не настроен: задайте APISHIP_BASE_URL в .env");
  }

  if (
    company.apishipLogin &&
    company.apishipPasswordEnc &&
    company.apishipConnectedAt
  ) {
    return createApishipClient({
      baseUrl,
      login: company.apishipLogin,
      password: decryptApishipPassword(company.apishipPasswordEnc),
    });
  }

  if (canUseEnvApishipFallback()) {
    return createApishipClientFromEnv();
  }

  throw new ApishipError(
    "APIShip не подключён. Укажите логин и пароль APIShip в настройках компании.",
  );
}

export function createApishipClientFromCredentials(input: {
  login: string;
  password: string;
}): ApishipClient {
  const baseUrl = process.env.APISHIP_BASE_URL;
  if (!baseUrl) {
    throw new ApishipError("APIShip не настроен: задайте APISHIP_BASE_URL в .env");
  }

  return createApishipClient({
    baseUrl,
    login: input.login,
    password: input.password,
  });
}
