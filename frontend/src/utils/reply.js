// Device replies can be a multi-line serial log (echo, separators, "LoRa << +OK",
// then "Reply Address:2,Message:ACK:R1ON"). Show just the useful line in the
// control dialogs; the full text is still stored with the command in the logs.
export function compactReply(reply) {
  if (typeof reply !== 'string') return '';
  const text = reply.trim();
  const line = text.match(/Reply\s*Address[^\r\n]*/i)?.[0];
  if (line) return line.trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length > 2 ? lines.at(-1) : text;
}
