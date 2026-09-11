const UNISENDER_SEND_URL =
  "https://go2.unisender.ru/ru/transactional/api/v1/email/send.json";

function buildVerificationHtml(verifyUrl: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;600;700&display=swap" rel="stylesheet" />
  <title>Подтвердите email — OCO</title>
</head>
<body style="margin:0;padding:0;background:#eef4f3;font-family:'Onest',system-ui,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4f3;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e3ecea;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;">
              <div style="display:inline-block;width:40px;height:40px;border-radius:50%;background:#0d8f99;margin-bottom:16px;"></div>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Подтвердите email</h1>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
                Нажмите кнопку ниже, чтобы подтвердить адрес и начать создавать отправления в OCO Logistics.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px;text-align:center;">
              <a href="${verifyUrl}" style="display:inline-block;padding:14px 28px;background:#0d8f99;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:12px;">
                Подтвердить email
              </a>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#9ca3af;">
                Ссылка действует 24 часа. Если вы запросите письмо повторно, работать будет только последняя ссылка. Если вы не регистрировались в OCO — просто проигнорируйте это письмо.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">OCO Logistics</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPasswordResetHtml(resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;600;700&display=swap" rel="stylesheet" />
  <title>Сброс пароля — OCO</title>
</head>
<body style="margin:0;padding:0;background:#eef4f3;font-family:'Onest',system-ui,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4f3;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e3ecea;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;">
              <div style="display:inline-block;width:40px;height:40px;border-radius:50%;background:#0d8f99;margin-bottom:16px;"></div>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Сброс пароля</h1>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
                Вы запросили сброс пароля для аккаунта OCO Logistics. Нажмите кнопку ниже, чтобы задать новый пароль.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px;text-align:center;">
              <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;background:#0d8f99;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:12px;">
                Сбросить пароль
              </a>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#9ca3af;">
                Ссылка действует 1 час. Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">OCO Logistics</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildCarrierConnectionRequestHtml(
  companyName: string,
  providerDisplayName: string,
  providerKey: string,
): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;600;700&display=swap" rel="stylesheet" />
  <title>Заявка на подключение перевозчика — OCO</title>
</head>
<body style="margin:0;padding:0;background:#eef4f3;font-family:'Onest',system-ui,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4f3;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e3ecea;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;">
              <div style="display:inline-block;width:40px;height:40px;border-radius:50%;background:#0d8f99;margin-bottom:16px;"></div>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Заявка на подключение</h1>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
                Компания «${companyName}» запросила подключение перевозчика ${providerDisplayName} (${providerKey}).
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">OCO Logistics</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const apiKey = process.env.UNISENDER_GO_API_KEY;
  const fromEmail = process.env.UNISENDER_GO_FROM_EMAIL;
  const fromName = process.env.UNISENDER_GO_FROM_NAME ?? "OCO Logistics";

  if (!apiKey || !fromEmail) {
    throw new Error(
      "UNISENDER_GO_API_KEY и UNISENDER_GO_FROM_EMAIL должны быть заданы в .env",
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

  const requestBody = {
    message: {
      recipients: [{ email: to }],
      from_email: fromEmail,
      from_name: fromName,
      subject: "Сброс пароля OCO",
      body: {
        html: buildPasswordResetHtml(resetUrl),
        plaintext: `Сброс пароля OCO Logistics: ${resetUrl}\n\nСсылка действует 1 час.`,
      },
      track_links: 0,
      track_read: 0,
    },
  };

  try {
    const response = await fetch(UNISENDER_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Unisender Go HTTP error:", response.status, body);
      throw new Error(`Unisender Go HTTP ${response.status}`);
    }

    const data = (await response.json()) as { status?: string; error?: string };
    if (data.status === "error") {
      console.error("Unisender Go API error:", data.error);
      throw new Error("Unisender Go API error");
    }
  } catch (error) {
    console.error("sendPasswordResetEmail failed", error);
    throw error;
  }
}

export async function sendCarrierConnectionRequestNotification(
  companyName: string,
  providerKey: string,
  providerDisplayName: string,
): Promise<void> {
  const apiKey = process.env.UNISENDER_GO_API_KEY;
  const fromEmail = process.env.UNISENDER_GO_FROM_EMAIL;
  const fromName = process.env.UNISENDER_GO_FROM_NAME ?? "OCO Logistics";
  const notifyEmail = process.env.FOUNDER_NOTIFICATION_EMAIL;

  if (!apiKey || !fromEmail || !notifyEmail) {
    throw new Error(
      "UNISENDER_GO_API_KEY, UNISENDER_GO_FROM_EMAIL и FOUNDER_NOTIFICATION_EMAIL должны быть заданы в .env",
    );
  }

  const subject = `Заявка на подключение перевозчика: ${providerDisplayName}`;
  const plaintext = `Компания «${companyName}» запросила подключение перевозчика ${providerDisplayName} (${providerKey}).`;

  const requestBody = {
    message: {
      recipients: [{ email: notifyEmail }],
      from_email: fromEmail,
      from_name: fromName,
      subject,
      body: {
        html: buildCarrierConnectionRequestHtml(companyName, providerDisplayName, providerKey),
        plaintext,
      },
      track_links: 0,
      track_read: 0,
    },
  };

  try {
    const response = await fetch(UNISENDER_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Unisender Go HTTP error:", response.status, body);
      throw new Error(`Unisender Go HTTP ${response.status}`);
    }

    const data = (await response.json()) as { status?: string; error?: string };
    if (data.status === "error") {
      console.error("Unisender Go API error:", data.error);
      throw new Error("Unisender Go API error");
    }
  } catch (error) {
    console.error("sendCarrierConnectionRequestNotification failed", error);
    throw error;
  }
}

/**
 * Seller-facing confirmation after an integration request is stored.
 * carrierSellerName must already be resolved via providerSellerDisplayName (masked).
 * requestDateLabel must already be formatted (e.g. formatDateMoscow).
 */
export function buildCarrierIntegrationRequestSellerConfirmationPlaintext(
  carrierSellerName: string,
  requestDateLabel: string,
): string {
  return `Здравствуйте!

Мы получили вашу заявку на техническую интеграцию перевозчика ${carrierSellerName} от ${requestDateLabel}.

Спасибо — такие заявки напрямую влияют на то, каких перевозчиков мы подключаем в первую очередь.

Что будет дальше

Мы оценим, что именно нужно доработать в ОСО для работы с этой службой. Возможность и сроки зависят от нескольких вещей: какие операции перевозчик открывает через свой программный интерфейс, на каких условиях он предоставляет к нему доступ, и от нашей текущей очереди задач. Как только по вашей заявке появится определённость, мы напишем вам отдельно.

Что эта заявка не делает

Кнопка «Запросить техническую интеграцию» — это сигнал команде ОСО о том, что вам нужна возможность работать с этой службой через ОСО. Заявка не заключает договор с перевозчиком и не подключает вас к нему.

Договор и учётную запись вы оформляете самостоятельно, напрямую с перевозчиком. ОСО не является стороной этого договора и не оказывает услуги перевозки — мы даём единый интерфейс к тем службам, с которыми у вас уже есть договор.

Это письмо отправлено автоматически. Если появятся вопросы — напишите нам на support@useoco.ru. Когда по вашей заявке появится определённость, мы сообщим вам отдельно.

С уважением,
команда ОСО`;
}

function buildCarrierIntegrationRequestSellerConfirmationHtml(
  carrierSellerName: string,
  requestDateLabel: string,
): string {
  const plaintext = buildCarrierIntegrationRequestSellerConfirmationPlaintext(
    carrierSellerName,
    requestDateLabel,
  );
  const bodyHtml = plaintext
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />\n");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;600;700&display=swap" rel="stylesheet" />
  <title>Заявка на техническую интеграцию перевозчика принята — OCO</title>
</head>
<body style="margin:0;padding:0;background:#eef4f3;font-family:'Onest',system-ui,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4f3;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e3ecea;">
          <tr>
            <td style="padding:32px;text-align:left;font-size:15px;line-height:1.6;color:#4b5563;">
              ${bodyHtml}
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">OCO Logistics</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendCarrierIntegrationRequestSellerConfirmation(
  to: string,
  carrierSellerName: string,
  requestDateLabel: string,
): Promise<void> {
  const apiKey = process.env.UNISENDER_GO_API_KEY;
  const fromEmail = process.env.UNISENDER_GO_FROM_EMAIL;
  const fromName = process.env.UNISENDER_GO_FROM_NAME ?? "OCO Logistics";

  if (!apiKey || !fromEmail) {
    throw new Error(
      "UNISENDER_GO_API_KEY и UNISENDER_GO_FROM_EMAIL должны быть заданы в .env",
    );
  }

  const subject = "Заявка на техническую интеграцию перевозчика принята";
  const plaintext = buildCarrierIntegrationRequestSellerConfirmationPlaintext(
    carrierSellerName,
    requestDateLabel,
  );

  const requestBody = {
    message: {
      recipients: [{ email: to }],
      from_email: fromEmail,
      from_name: fromName,
      subject,
      body: {
        html: buildCarrierIntegrationRequestSellerConfirmationHtml(
          carrierSellerName,
          requestDateLabel,
        ),
        plaintext,
      },
      track_links: 0,
      track_read: 0,
    },
  };

  try {
    const response = await fetch(UNISENDER_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Unisender Go HTTP error:", response.status, body);
      throw new Error(`Unisender Go HTTP ${response.status}`);
    }

    const data = (await response.json()) as { status?: string; error?: string };
    if (data.status === "error") {
      console.error("Unisender Go API error:", data.error);
      throw new Error("Unisender Go API error");
    }
  } catch (error) {
    console.error("sendCarrierIntegrationRequestSellerConfirmation failed", error);
    throw error;
  }
}

/**
 * How a verification send ended — THREE outcomes, not a boolean.
 *
 * WHY THREE. The caller rolls the token column back when a letter did not go
 * out, so the link in the previous letter keeps working. That is only safe when
 * non-delivery is PROVEN: if the letter may have been delivered, rolling back
 * kills the very link it carries. So «not sent» and «not established» must stay
 * apart all the way to the caller.
 *
 * `reason` is for the operator's log and nothing else: variable NAMES, an HTTP
 * status, an error code. Never a value, never a response body (it can echo the
 * recipient's address), never an error message (it can carry anything).
 */
export type VerificationEmailOutcome =
  | { delivery: "sent" }
  | { delivery: "not_sent"; reason: string }
  | { delivery: "unknown"; reason: string };

/** Every point at which a send can end, as the facts that point leaves behind. */
export type VerificationSendStage =
  | { stage: "config_missing"; missing: readonly string[] }
  | { stage: "request_failed"; code: string }
  | { stage: "http_error"; status: number }
  | { stage: "unreadable_body"; status: number }
  | { stage: "api_status"; status: number; apiStatus: unknown };

/**
 * Where «not sent» ends and «not established» begins — decided by reading this
 * file, not by guessing at the provider.
 *
 * NOT SENT, proven:
 * - configuration missing — the function returns before any network call;
 * - HTTP 4xx — the provider refused the request;
 * - 2xx whose body says `status: "error"` — the provider said so itself.
 *
 * NOT ESTABLISHED:
 * - ANY rejected `fetch`. The code cannot tell a failure before the request
 *   left from one after it: both are the same `await fetch` throwing. A reset or
 *   a timeout after the body was sent may follow an accepted message.
 * - HTTP 5xx and any other non-2xx that is not 4xx. A 504 means a gateway gave
 *   up waiting — the server behind it may have taken the message.
 * - 2xx with a body that is not JSON. The HTTP request was accepted.
 *
 * The 4xx / 5xx line rests on HTTP semantics, NOT on measured Unisender
 * behaviour: nobody has observed what this provider does on either.
 */
export function classifyVerificationSend(
  s: VerificationSendStage,
): VerificationEmailOutcome {
  switch (s.stage) {
    case "config_missing": {
      const one = s.missing.length === 1;
      return {
        delivery: "not_sent",
        reason: `${s.missing.join(" and ")} ${one ? "is" : "are"} not set; no verification email can be sent until ${one ? "it is" : "they are"}`,
      };
    }
    case "request_failed":
      return {
        delivery: "unknown",
        reason: `request to Unisender Go failed (${s.code}); delivery not established`,
      };
    case "http_error":
      return s.status >= 400 && s.status < 500
        ? {
            delivery: "not_sent",
            reason: `Unisender Go refused the send with HTTP ${s.status}`,
          }
        : {
            delivery: "unknown",
            reason: `Unisender Go answered HTTP ${s.status}; delivery not established`,
          };
    case "unreadable_body":
      return {
        delivery: "unknown",
        reason: `Unisender Go answered HTTP ${s.status} with a body that is not JSON; delivery not established`,
      };
    case "api_status":
      return s.apiStatus === "error"
        ? {
            delivery: "not_sent",
            reason: `Unisender Go answered HTTP ${s.status} with API status error`,
          }
        : { delivery: "sent" };
  }
}

const CODE_LIKE = /^[A-Z][A-Z0-9_]{1,63}$/;
const NAME_LIKE = /^[A-Za-z][A-Za-z0-9]{0,63}$/;

/**
 * A loggable word for a rejected `fetch`: the cause's code when it looks like a
 * code (ECONNRESET, UND_ERR_SOCKET), else the error's name — NEVER its message,
 * which can carry the URL or anything else a runtime chose to put there.
 */
export function requestFailureCode(error: unknown): string {
  if (!(error instanceof Error)) {
    return "unknown";
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== null && typeof cause === "object") {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string" && CODE_LIKE.test(code)) {
      return code;
    }
  }
  return NAME_LIKE.test(error.name) ? error.name : "Error";
}

/**
 * Sends the verification letter and REPORTS how it ended. Never throws: an
 * expected outcome is a value to branch on, not an exception — the same reason
 * `redeemVerification` uses `updateMany`.
 */
export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<VerificationEmailOutcome> {
  const apiKey = process.env.UNISENDER_GO_API_KEY;
  const fromEmail = process.env.UNISENDER_GO_FROM_EMAIL;
  const fromName = process.env.UNISENDER_GO_FROM_NAME ?? "OCO Logistics";

  if (!apiKey || !fromEmail) {
    const missing = [
      ...(!apiKey ? ["UNISENDER_GO_API_KEY"] : []),
      ...(!fromEmail ? ["UNISENDER_GO_FROM_EMAIL"] : []),
    ];
    return classifyVerificationSend({ stage: "config_missing", missing });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const verifyUrl = `${appUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;

  const requestBody = {
    message: {
      recipients: [{ email: to }],
      from_email: fromEmail,
      from_name: fromName,
      subject: "Подтвердите email — OCO",
      body: {
        html: buildVerificationHtml(verifyUrl),
        // «24 часа» alone was a promise the product breaks: a resend overwrites
        // the token column, so the previous link dies the moment a new one is
        // asked for, however much of the day is left. Both bodies say so.
        plaintext: `Подтвердите email в OCO Logistics: ${verifyUrl}\n\nСсылка действует 24 часа. Если вы запросите письмо повторно, работать будет только последняя ссылка.`,
      },
      track_links: 0,
      track_read: 0,
    },
  };

  // Nothing is logged in here: the outcome's `reason` travels to the route,
  // which writes ONE line that also says what became of the token.
  let response: Response;
  try {
    response = await fetch(UNISENDER_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    return classifyVerificationSend({
      stage: "request_failed",
      code: requestFailureCode(error),
    });
  }

  if (!response.ok) {
    return classifyVerificationSend({ stage: "http_error", status: response.status });
  }

  let data: { status?: unknown } | null;
  try {
    data = (await response.json()) as { status?: unknown } | null;
  } catch {
    return classifyVerificationSend({ stage: "unreadable_body", status: response.status });
  }

  return classifyVerificationSend({
    stage: "api_status",
    status: response.status,
    apiStatus: data?.status,
  });
}
