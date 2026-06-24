/**
 * Drift-мониторинг: сверка списка перевозчиков APIShip с CARRIER_REGISTRY.
 * Запуск: npm run carrier:drift
 */
import { createApishipClientFromEnv } from "../packages/integrations/apiship/src/client";
import { CARRIER_REGISTRY } from "../packages/core/src/carrier-picker/registry";

type ProviderEntry = { key: string; label: string };

function formatList(items: ProviderEntry[]): string {
  if (items.length === 0) return "  (пусто)";
  return items.map(({ key, label }) => `  ${key} (${label})`).join("\n");
}

async function main(): Promise<void> {
  const client = createApishipClientFromEnv();
  const providers = await client.listProviders();

  const apishipByKey = new Map(
    providers.map((p) => [p.key, p.name || p.key] as const),
  );
  const registryByKey = new Map(
    CARRIER_REGISTRY.map((c) => [c.providerKey, c.displayName] as const),
  );

  const apishipKeys = new Set(apishipByKey.keys());
  const registryKeys = new Set(registryByKey.keys());

  const added: ProviderEntry[] = [...apishipKeys]
    .filter((key) => !registryKeys.has(key))
    .sort()
    .map((key) => ({ key, label: apishipByKey.get(key) ?? key }));

  const removed: ProviderEntry[] = [...registryKeys]
    .filter((key) => !apishipKeys.has(key))
    .sort()
    .map((key) => ({ key, label: registryByKey.get(key) ?? key }));

  const unchanged: ProviderEntry[] = [...registryKeys]
    .filter((key) => apishipKeys.has(key))
    .sort()
    .map((key) => ({ key, label: registryByKey.get(key) ?? key }));

  console.log("=== НОВЫЕ (в APIShip, нет в CARRIER_REGISTRY) ===");
  console.log(formatList(added));
  console.log("");
  console.log("=== УДАЛЁННЫЕ (в CARRIER_REGISTRY, нет в APIShip) ===");
  console.log(formatList(removed));
  console.log("");
  console.log("=== БЕЗ ИЗМЕНЕНИЙ ===");
  console.log(formatList(unchanged));

  if (removed.length > 0) {
    console.error("");
    console.error(
      `Внимание: ${removed.length} перевозчиков из CARRIER_REGISTRY пропали из APIShip. Требуется ревью registry.ts.`,
    );
    process.exit(1);
  }

  console.log("");
  console.log("Drift не обнаружен — реестр совпадает с APIShip.");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Неизвестная ошибка";
  console.error(`Ошибка drift-проверки: ${message}`);
  process.exit(1);
});
