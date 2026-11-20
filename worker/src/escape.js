/** Single source of truth for escaping untrusted text (spec fields, URLs, errors) before it reaches HTML or SVG/XML. */
const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => MAP[c] || c);
}
/** XML escaping is the same set of five entities (&#39; is valid XML). */
export const escapeXml = escapeHtml;
/** True only for absolute http: or https: URLs. */
export function isHttpUrl(value) {
    if (typeof value !== "string" || !value.trim())
        return false;
    try {
        const u = new URL(value.trim());
        return u.protocol === "http:" || u.protocol === "https:";
    }
    catch {
        return false;
    }
}
