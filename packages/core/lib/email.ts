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
                Ссылка действует 24 часа. Если вы не регистрировались в OCO — просто проигнорируйте это письмо.
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

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const apiKey = process.env.UNISENDER_GO_API_KEY;
  const fromEmail = process.env.UNISENDER_GO_FROM_EMAIL;
  const fromName = process.env.UNISENDER_GO_FROM_NAME ?? "OCO Logistics";

  if (!apiKey || !fromEmail) {
    throw new Error(
      "UNISENDER_GO_API_KEY и UNISENDER_GO_FROM_EMAIL должны быть заданы в .env",
    );
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
        plaintext: `Подтвердите email в OCO Logistics: ${verifyUrl}\n\nСсылка действует 24 часа.`,
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
      console.error("Unisender Go HTTP error:", response.status);
      throw new Error(`Unisender Go HTTP ${response.status}`);
    }

    const data = (await response.json()) as { status?: string; error?: string };
    if (data.status === "error") {
      console.error("Unisender Go API error");
      throw new Error("Unisender Go API error");
    }
  } catch (error) {
    console.error("sendVerificationEmail failed");
    throw error;
  }
}
