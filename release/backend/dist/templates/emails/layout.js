/**
 * Shared HTML email layout. Table-based and inline-styled because that is what mail clients render reliably.
 * EVERY value interpolated into HTML goes through `esc()`, and links are restricted to http(s), so names or notes
 * typed by customers cannot inject markup into an email.
 */
export const PLATFORM_BRAND = { name: 'Zobix Solutions', primaryColor: '#7c5cff' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (url) => (/^https?:\/\//i.test(url) ? url : '#');
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : PLATFORM_BRAND.primaryColor);
export function renderEmail(brand, subject, c) {
    const color = safeColor(brand.primaryColor);
    const header = brand.logoUrl && /^https?:\/\//i.test(brand.logoUrl)
        ? `<img src="${esc(safeUrl(brand.logoUrl))}" alt="${esc(brand.name)}" height="36" style="display:block;border:0;height:36px;">`
        : `<span style="font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${color};">${esc(brand.name)}</span>`;
    const rows = (c.rows ?? [])
        .map((r) => `<tr><td style="padding:8px 0;color:#8b91a8;font-size:13px;width:38%;vertical-align:top;">${esc(r.label)}</td><td style="padding:8px 0;color:#eef0f7;font-size:14px;font-weight:600;">${esc(r.value)}</td></tr>`)
        .join('');
    const button = c.cta
        ? `<p style="margin:24px 0 0;"><a href="${esc(safeUrl(c.cta.url))}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:9px;font-weight:bold;font-size:15px;">${esc(c.cta.label)}</a></p>`
        : '';
    const secondary = c.secondary
        ? `<p style="margin:14px 0 0;"><a href="${esc(safeUrl(c.secondary.url))}" style="color:#22e1ff;font-size:14px;text-decoration:none;">${esc(c.secondary.label)} &rarr;</a></p>`
        : '';
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#07080d;font-family:Arial,Helvetica,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(c.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07080d;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0e1019;border:1px solid #232738;border-radius:16px;">
<tr><td style="padding:26px 28px 6px;">${header}</td></tr>
<tr><td style="height:3px;background:${color};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:22px 28px 6px;font-size:22px;font-weight:bold;color:#eef0f7;">${esc(c.title)}</td></tr>
<tr><td style="padding:6px 28px 26px;font-size:15px;line-height:1.6;color:#c9cde0;">
${c.intro.map((p) => `<p style="margin:0 0 12px;">${esc(p)}</p>`).join('')}
${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 4px;border-top:1px solid #232738;border-bottom:1px solid #232738;">${rows}</table>` : ''}
${button}${secondary}
</td></tr>
</table>
<p style="max-width:520px;margin:16px 0 0;font-size:12px;line-height:1.5;color:#6b7188;text-align:center;">${esc(c.footnote ?? `Sent by ${brand.name}.`)}<br>Powered by Zobix Solutions</p>
</td></tr></table></body></html>`;
    const text = [
        c.title,
        '',
        ...c.intro,
        ...(c.rows?.length ? ['', ...c.rows.map((r) => `${r.label}: ${r.value}`)] : []),
        ...(c.cta ? ['', `${c.cta.label}: ${c.cta.url}`] : []),
        ...(c.secondary ? [`${c.secondary.label}: ${c.secondary.url}`] : []),
        '',
        c.footnote ?? `Sent by ${brand.name}.`,
    ].join('\n');
    return { subject, html, text };
}
//# sourceMappingURL=layout.js.map