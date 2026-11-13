export function badge(score) {
  const s = score == null ? 'n/a' : String(score);
  const color = score == null ? '#9f9f9f' : score >= 90 ? '#3fb950' : score >= 70 ? '#d29922' : '#e5534b';
  const l = 'MCP readiness', lw = 92, rw = 8 + s.length * 7 + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${l}: ${s}"><title>${l}: ${s}</title><linearGradient id="g" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${lw + rw}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><rect width="${lw + rw}" height="20" fill="url(#g)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="14">${l}</text><text x="${lw + rw / 2}" y="14">${s}</text></g></svg>`;
}
