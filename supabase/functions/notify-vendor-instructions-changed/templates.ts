// Email templates for vendor "instructions updated" notification.
// Single-source-of-truth — duplicated as standalone files in templates/ for
// reference only.

export const HTML_TEMPLATE = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Updated instructions for {{order_number}}</title>
<!--[if mso]>
<xml>
  <o:OfficeDocumentSettings>
    <o:AllowPNG/>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings>
</xml>
<style type="text/css">
  table, td, div, h1, h2, p, a { font-family: 'Segoe UI', Arial, sans-serif !important; }
</style>
<![endif]-->
<style type="text/css">
  /* Client resets */
  html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
  img { -ms-interpolation-mode: bicubic; border: 0; line-height: 100%; outline: none; text-decoration: none; }
  a { text-decoration: none; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }

  /* Preheader */
  .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; overflow: hidden; mso-hide: all; }

  /* Mobile */
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; max-width: 100% !important; }
    .px-outer { padding-left: 20px !important; padding-right: 20px !important; }
    .px-card { padding-left: 24px !important; padding-right: 24px !important; }
    .h1-mobile { font-size: 26px !important; line-height: 1.2 !important; }
    .meta-stack { display: block !important; width: 100% !important; padding: 14px 0 !important; border-right: 0 !important; border-bottom: 1px solid #E2E8F0 !important; }
    .meta-stack-last { border-bottom: 0 !important; }
    .cta-btn a { display: block !important; padding-left: 24px !important; padding-right: 24px !important; }
    .hide-mobile { display: none !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; width:100%; background-color:#F1F5F9; font-family:'Plus Jakarta Sans', 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;">

<!-- Preheader (inbox preview snippet) -->
<div class="preheader">
  {{updated_by_staff_name}} updated the client instructions for {{order_number}}. Review before continuing work.
</div>

<!-- Outer wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9;">
  <tr>
    <td align="center" style="padding:0;">

      <!--[if mso | IE]>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td>
      <![endif]-->

      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px;">

        <!-- Top spacer -->
        <tr><td style="height:32px; line-height:32px; font-size:0;">&nbsp;</td></tr>

        <!-- Header: navy bar with logo -->
        <tr>
          <td class="px-outer" align="left" style="background-color:#0C2340; padding:24px 32px; border-radius:12px 12px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="left" style="vertical-align:middle;">
                  <a href="https://cethos.com" style="text-decoration:none; color:#FFFFFF;">
                    <img src="https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/final_logo_dark_bg_cethosAsset%202.svg"
                         alt="Cethos"
                         width="132"
                         height="32"
                         style="display:block; border:0; outline:none; text-decoration:none; height:32px; width:132px;">
                  </a>
                </td>
                <td align="right" class="hide-mobile" style="vertical-align:middle; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif; font-size:12px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:#7DD3FC;">
                  Vendor Portal
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Status ribbon -->
        <tr>
          <td style="background-color:#E0F2FE; padding:0; border-left:1px solid #E5E7EB; border-right:1px solid #E5E7EB;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="px-outer" style="padding:12px 32px; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif; font-size:12px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:#0E7490;">
                  <!--[if mso]>&nbsp;<![endif]-->
                  <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:#0891B2; margin-right:8px; vertical-align:middle;">&nbsp;</span>
                  <span style="vertical-align:middle;">Instructions updated &middot; Action required</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- White card body -->
        <tr>
          <td class="px-card" style="background-color:#FFFFFF; padding:40px 40px 16px 40px; border-left:1px solid #E5E7EB; border-right:1px solid #E5E7EB; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;">

            <!-- H1 -->
            <h1 class="h1-mobile" style="margin:0 0 20px 0; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif; font-size:30px; line-height:1.2; font-weight:700; color:#0C2340; letter-spacing:-0.01em;">
              Updated instructions for {{order_number}}
            </h1>

            <!-- Greeting -->
            <p style="margin:0 0 16px 0; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif; font-size:16px; line-height:1.6; color:#0C2340; font-weight:600;">
              Hi {{vendor_name}},
            </p>

            <!-- Lead -->
            <p style="margin:0 0 28px 0; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif; font-size:16px; line-height:1.6; color:#4B5563;">
              The client's instructions for this order have just been updated. Please review the latest brief below before you continue work &mdash; even small revisions can affect terminology, tone, or delivery expectations.
            </p>

          </td>
        </tr>

        <!-- Order meta block -->
        <tr>
          <td class="px-card" style="background-color:#FFFFFF; padding:0 40px 8px 40px; border-left:1px solid #E5E7EB; border-right:1px solid #E5E7EB;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <!-- Order -->
                      <td class="meta-stack" valign="top" style="width:25%; padding-right:16px; border-right:1px solid #E2E8F0; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;">
                        <div style="font-size:11px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:#64748B; margin-bottom:6px;">Order</div>
                        <div style="font-size:15px; font-weight:700; color:#0C2340; font-family:'SF Mono','Menlo','Consolas',monospace; letter-spacing:-0.01em;">{{order_number}}</div>
                      </td>

                      {{#if project_number}}
                      <!-- Project (conditional) -->
                      <td class="meta-stack" valign="top" style="width:25%; padding-left:16px; padding-right:16px; border-right:1px solid #E2E8F0; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;">
                        <div style="font-size:11px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:#64748B; margin-bottom:6px;">Project</div>
                        <div style="font-size:15px; font-weight:700; color:#0C2340; font-family:'SF Mono','Menlo','Consolas',monospace; letter-spacing:-0.01em;">{{project_number}}</div>
                      </td>
                      {{/if}}

                      <!-- Updated by -->
                      <td class="meta-stack" valign="top" style="width:25%; padding-left:16px; padding-right:16px; border-right:1px solid #E2E8F0; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;">
                        <div style="font-size:11px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:#64748B; margin-bottom:6px;">Updated by</div>
                        <div style="font-size:15px; font-weight:600; color:#0C2340;">{{updated_by_staff_name}}</div>
                      </td>

                      <!-- Updated at -->
                      <td class="meta-stack meta-stack-last" valign="top" style="width:25%; padding-left:16px; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;">
                        <div style="font-size:11px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:#64748B; margin-bottom:6px;">Updated at</div>
                        <div style="font-size:15px; font-weight:600; color:#0C2340;">{{updated_at}}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- What changed -->
        <tr>
          <td class="px-card" style="background-color:#FFFFFF; padding:32px 40px 8px 40px; border-left:1px solid #E5E7EB; border-right:1px solid #E5E7EB; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:0 0 12px 0;">
                  <div style="font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#0891B2;">What changed</div>
                </td>
              </tr>
              <tr>
                <td style="background-color:#FFFFFF; border-left:3px solid #0891B2; padding:4px 0 4px 20px;">
                  <p style="margin:0; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif; font-size:16px; line-height:1.6; color:#0C2340;">
                    {{change_summary}}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td class="px-card" align="left" style="background-color:#FFFFFF; padding:32px 40px 8px 40px; border-left:1px solid #E5E7EB; border-right:1px solid #E5E7EB;">
            <!-- Bulletproof button -->
            <table role="presentation" class="cta-btn" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
              <tr>
                <td align="center" style="border-radius:8px; background-color:#0891B2;">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{vendor_portal_url}}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="16%" stroke="f" fillcolor="#0891B2">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:600;">Review updated instructions</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-- -->
                  <a href="{{vendor_portal_url}}"
                     style="display:inline-block; padding:16px 32px; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif; font-size:16px; font-weight:600; color:#FFFFFF; background-color:#0891B2; border-radius:8px; text-decoration:none; mso-padding-alt:0;">
                    Review updated instructions &nbsp;&rarr;
                  </a>
                  <!--<![endif]-->
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Reassurance line -->
        <tr>
          <td class="px-card" style="background-color:#FFFFFF; padding:24px 40px 40px 40px; border-left:1px solid #E5E7EB; border-right:1px solid #E5E7EB; border-bottom:1px solid #E5E7EB; border-radius:0 0 12px 12px; font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;">
            <p style="margin:0; font-size:14px; line-height:1.6; color:#64748B;">
              You can keep going with any in-progress work &mdash; just please align your output with the latest instructions before delivery. If anything is unclear, reply to this email or reach out to us before continuing.
            </p>
          </td>
        </tr>

        <!-- Footer spacer -->
        <tr><td style="height:24px; line-height:24px; font-size:0;">&nbsp;</td></tr>

        <!-- Footer -->
        <tr>
          <td class="px-outer" style="padding:0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif; font-size:13px; line-height:1.6; color:#64748B;">
                  <p style="margin:0 0 8px 0;">
                    Questions? Contact
                    <a href="mailto:{{support_email}}" style="color:#0891B2; text-decoration:none; font-weight:600;">{{support_email}}</a>
                  </p>
                  <p style="margin:0 0 16px 0; color:#94A3B8; font-size:12px;">
                    You're receiving this because you're an active vendor on the Cethos platform.
                  </p>
                  <p style="margin:0; color:#94A3B8; font-size:12px;">
                    &copy; 2026 Cethos Translations. Global communication. Local precision.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Bottom spacer -->
        <tr><td style="height:32px; line-height:32px; font-size:0;">&nbsp;</td></tr>

      </table>

      <!--[if mso | IE]>
      </td></tr></table>
      <![endif]-->

    </td>
  </tr>
</table>

</body>
</html>
`;

export const TEXT_TEMPLATE = `CETHOS VENDOR PORTAL
Instructions updated - Action required

===========================================================

UPDATED INSTRUCTIONS FOR {{order_number}}

Hi {{vendor_name}},

The client's instructions for this order have just been
updated. Please review the latest brief below before you
continue work - even small revisions can affect terminology,
tone, or delivery expectations.

-----------------------------------------------------------
ORDER DETAILS
-----------------------------------------------------------
  Order:       {{order_number}}
  Project:     {{project_number}}
  Updated by:  {{updated_by_staff_name}}
  Updated at:  {{updated_at}}

-----------------------------------------------------------
WHAT CHANGED
-----------------------------------------------------------
  {{change_summary}}

-----------------------------------------------------------
REVIEW THE UPDATE
-----------------------------------------------------------
Open the order in the vendor portal to see the full
updated brief and any attached reference files:

  {{vendor_portal_url}}

You can keep going with any in-progress work - just please
align your output with the latest instructions before
delivery. If anything is unclear, reply to this email or
reach out to us before continuing.

===========================================================

Questions? Contact {{support_email}}

You're receiving this because you're an active vendor on
the Cethos platform.

(c) 2026 Cethos Translations
Global communication. Local precision.
`;
