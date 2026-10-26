// Split only unescaped GFM table pipes. Positions refer to the original source.
export function tableCells(line, offset = 0) {
  const cuts = [-1];
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '|') continue;
    let slashes = 0; for (let n = i - 1; n >= 0 && line[n] === '\\'; n--) slashes++;
    if (slashes % 2 === 0) cuts.push(i);
  }
  cuts.push(line.length);
  const cells = cuts.slice(0, -1).map((cut, i) => {
    const text = line.slice(cut + 1, cuts[i + 1]);
    return {text:text.trim(), from:offset + cut + 1 + (text.length - text.trimStart().length)};
  });
  if (line.trimStart().startsWith('|')) cells.shift();
  if (line.trimEnd().endsWith('|') && cuts.at(-2) === line.trimEnd().length - 1) cells.pop();
  return cells;
}

// A parsed Table node excludes its first container prefix, but subsequent
// source lines still include blockquote markers. Never treat those as cells.
export function tableRowCells(line,offset=0){const prefix=line.match(/^[ \t]*(?:>[ \t]*)+/)?.[0]||'';return tableCells(line.slice(prefix.length),offset+prefix.length);}
export function tableContainerPrefix(text,from){const prefix=text.slice(text.lastIndexOf('\n',from-1)+1,from);return prefix.replace(/(?:[-+*]|\d+[.)])[ \t]+$/,mark=>' '.repeat(mark.length));}

export function tableModel(text, from = 0) {
  const lines = text.split('\n'), header = tableRowCells(lines[0], from);
  const align = tableRowCells(lines[1] || '').map(cell => cell.text.startsWith(':') ? cell.text.endsWith(':') ? 'center' : 'left' : cell.text.endsWith(':') ? 'right' : 'left');
  let offset = from + lines[0].length + 1 + (lines[1]?.length || 0) + 1;
  const rows = lines.slice(2, 102).map(line => {
    const cells = tableRowCells(line, offset); offset += line.length + 1;
    return header.map((_, i) => cells[i] || {text:'',from:offset-line.length-1});
  });
  return {header, align, rows, truncated:lines.length > 102};
}

export function imageLocation(reference, base) {
  const path = reference.replace(/^<([\s\S]*)>$/, '$1').replace(/\\([\\()[\] ])/g, '$1');
  if (/^https:\/\//i.test(path)) {
    try { const url = new URL(path); if (url.username || url.password) return {kind:'blocked'}; return {kind:'remote',url:url.href,host:url.hostname}; } catch { return {kind:'blocked'}; }
  }
  if (/^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/=\s]+$/i.test(path) && path.length <= 4 * 1024 * 1024) return {kind:'local',url:path};
  if (/^(?!file:)[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//')) return {kind:'blocked'};
  if (!base) return {kind:'unsaved'};
  if (base.startsWith('mokune-image:')) return {kind:'local',url:`${base}?path=${encodeURIComponent(path)}`};
  // Browser tests/preview use a same-origin base. Native file access always
  // goes through the scoped scheme handler above.
  try { const url = new URL(path, new URL(base, location.href)); return url.origin === location.origin ? {kind:'local',url:url.href} : {kind:'blocked'}; } catch { return {kind:'blocked'}; }
}
