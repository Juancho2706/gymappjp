/**
 * Base HTML email layout. All EVA transactional and drip emails share this shell
 * so they look consistent and professional across major email clients.
 *
 * Design: dark header (#0f172a) + white card body + EVA green accent (#10B981).
 * All styles inline — required for Gmail/Outlook compatibility.
 */

export type BaseEmailOptions = {
    previewText?: string
    headerTitle?: string
    footerText?: string
}

const EVA_GREEN = '#10B981'
const DARK_BG = '#0f172a'
const CARD_BG = '#ffffff'
const TEXT_PRIMARY = '#111827'
const TEXT_MUTED = '#6b7280'
const BORDER = '#e5e7eb'

export function wrapEmailLayout(body: string, opts: BaseEmailOptions = {}): string {
    const preview = opts.previewText
        ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#ffffff;line-height:1px;">${opts.previewText}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>`
        : ''

    const headerTitle = opts.headerTitle ?? 'EVA'

    const footer = opts.footerText
        ? `<p style="margin:0 0 4px;">${opts.footerText}</p>`
        : ''

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${headerTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${preview}
  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <!-- Container -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background-color:${DARK_BG};border-radius:12px 12px 0 0;padding:24px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">EVA</span>
                    <span style="font-size:22px;font-weight:300;color:${EVA_GREEN};margin-left:2px;">·</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card body -->
          <tr>
            <td style="background-color:${CARD_BG};padding:32px 32px 24px;border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;border:1px solid ${BORDER};border-top:none;border-radius:0 0 12px 12px;padding:16px 32px;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};line-height:1.6;">
                ${footer}
                Enviado por <strong>EVA Fitness Platform</strong>. Si no esperabas este correo, podés ignorarlo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Renders a primary CTA button */
export function ctaButton(label: string, url: string, color = EVA_GREEN): string {
    return `<a href="${url}" target="_blank" style="display:inline-block;padding:13px 24px;background-color:${color};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.1px;">${label}</a>`
}

/** Renders a secondary (ghost) link button */
export function ghostButton(label: string, url: string): string {
    return `<a href="${url}" target="_blank" style="display:inline-block;padding:11px 22px;background-color:transparent;border:2px solid ${BORDER};color:${TEXT_MUTED};font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;">${label}</a>`
}

/** Renders a feature highlight row: icon placeholder + title + subtitle */
export function featureRow(icon: string, title: string, subtitle: string): string {
    return `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:12px;">
  <tr>
    <td width="36" valign="top" style="padding-right:12px;">
      <div style="width:36px;height:36px;background-color:#f0fdf4;border-radius:8px;text-align:center;line-height:36px;font-size:18px;">${icon}</div>
    </td>
    <td valign="top">
      <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#111827;">${title}</p>
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">${subtitle}</p>
    </td>
  </tr>
</table>`
}

/** Renders a horizontal divider */
export function divider(): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;"><tr><td style="border-top:1px solid ${BORDER};"></td></tr></table>`
}

/** Badge chip */
export function badge(text: string, color = EVA_GREEN): string {
    return `<span style="display:inline-block;padding:3px 10px;background-color:${color}1a;color:${color};font-size:11px;font-weight:700;letter-spacing:0.5px;border-radius:20px;text-transform:uppercase;">${text}</span>`
}
