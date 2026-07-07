/**
 * One-off: сырой каталог дополнительных услуг APIShip (extraParams) по перевозчикам.
 * Запуск: node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/check-carrier-extra-services.ts
 */
import { ApishipError } from "../packages/integrations/apiship/src/types";
import { createApishipClientFromEnv } from "../packages/integrations/apiship/src/client";

const PROVIDERS = ["cdek", "rupost", "yataxi", "dostavista", "x5"] as const;

async function main(): Promise<void> {
  const client = createApishipClientFromEnv();

  for (const providerKey of PROVIDERS) {
    console.log(`\n${"=".repeat(72)}`);
    console.log(`PROVIDER: ${providerKey}`);
    console.log("=".repeat(72));

    try {
      const data = await client.listServices(providerKey);
      console.log(JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      if (err instanceof ApishipError) {
        console.error(
          JSON.stringify(
            {
              error: "ApishipError",
              message: err.message,
              status: err.statusCode,
              code: err.code,
            },
            null,
            2,
          ),
        );
      } else {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ error: "UnknownError", message }, null, 2));
      }
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Неизвестная ошибка";
  console.error(`Фатальная ошибка: ${message}`);
  process.exit(1);
});
