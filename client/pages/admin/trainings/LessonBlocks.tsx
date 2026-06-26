import { useState } from "react";
import { AlertTriangle, ChevronRight, Eye, Info } from "lucide-react";

// Shared interactive lesson renderer (mirrors the vendor portal's LessonBlocks).
// content_blocks (jsonb on cvp_training_lessons) is an ordered array of:
//   { type: "prose", md }
//   { type: "steps", title?, steps: [{ title, body }] }
//   { type: "example", title?, intro?, items: [{ label, text, note?, tone? }] }
//   { type: "callout", variant: "rule"|"warning"|"info"|"tip", title?, body }
//   { type: "comparison", title?, columns: [{ label, tone: "good"|"bad", items[] }] }
export type Block =
  | { type: "prose"; md: string }
  | { type: "steps"; title?: string; steps: { title: string; body: string }[] }
  | { type: "example"; title?: string; intro?: string; items: { label: string; text: string; note?: string; tone?: string }[] }
  | { type: "callout"; variant?: string; title?: string; body: string }
  | { type: "comparison"; title?: string; columns: { label: string; tone?: string; items: string[] }[] }
  | { type: string; [k: string]: unknown };

function inline(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-gray-100 text-[13px]">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-teal-700 underline">$1</a>');
}
function mdToHtml(md: string): string {
  const lines = (md || "").split(/\r?\n/);
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const flushPara = () => { if (para.length) { out.push(`<p class="mb-3 leading-relaxed">${inline(para.join(" "))}</p>`); para = []; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); closeList(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,4})\s+(.+)$/))) {
      flushPara(); closeList();
      const lvl = m[1].length;
      const cls = lvl <= 2 ? "text-base font-semibold mt-4 mb-2" : "text-sm font-semibold mt-3 mb-1";
      out.push(`<div class="${cls} text-gray-900">${inline(m[2])}</div>`);
    } else if ((m = line.match(/^(\d+)\.\s+(.+)$/))) {
      flushPara();
      if (list !== "ol") { closeList(); out.push('<ol class="list-decimal ml-5 mb-3 space-y-1">'); list = "ol"; }
      out.push(`<li>${inline(m[2])}</li>`);
    } else if ((m = line.match(/^[-*]\s+(.+)$/))) {
      flushPara();
      if (list !== "ul") { closeList(); out.push('<ul class="list-disc ml-5 mb-3 space-y-1">'); list = "ul"; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^>\s?(.+)$/))) {
      flushPara(); closeList();
      out.push(`<blockquote class="border-l-2 border-teal-300 pl-3 italic text-gray-600 mb-3">${inline(m[1])}</blockquote>`);
    } else {
      closeList(); para.push(line);
    }
  }
  flushPara(); closeList();
  return out.join("");
}

function Prose({ md }: { md: string }) {
  return <div className="text-[15px] text-gray-700" dangerouslySetInnerHTML={{ __html: mdToHtml(md) }} />;
}

function Steps({ title, steps }: { title?: string; steps: { title: string; body: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="my-3">
      {title && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</div>}
      <div>
        {steps.map((s, i) => (
          <div key={i}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 border-t border-gray-100 py-2.5 text-left">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-teal-50 text-[13px] font-medium text-teal-700">{i + 1}</span>
              <span className="text-[15px] text-gray-900">{s.title}</span>
              <ChevronRight className={`ml-auto h-4 w-4 flex-none text-gray-300 transition-transform ${open === i ? "rotate-90" : ""}`} />
            </button>
            {open === i && <div className="pb-2.5 pl-9 text-sm leading-relaxed text-gray-600">{s.body}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Example({ title, intro, items }: { title?: string; intro?: string; items: { label: string; text: string; note?: string; tone?: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-3 rounded-xl border border-gray-200">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <Eye className="h-4 w-4 flex-none text-teal-600" />
        <span className="text-[15px] font-medium text-gray-900">{title || "Worked example"}</span>
        <ChevronRight className={`ml-auto h-4 w-4 flex-none text-gray-300 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-4">
          {intro && <p className="text-sm text-gray-600">{intro}</p>}
          {items.map((it, i) => {
            const info = it.tone === "info";
            return (
              <div key={i} className={`rounded-lg px-3 py-2 ${info ? "bg-teal-50" : it.tone === "muted" ? "bg-gray-50" : "border border-gray-100"}`}>
                <div className={`text-xs ${info ? "font-medium text-teal-700" : "text-gray-400"}`}>{it.label}</div>
                <div className={`text-[15px] ${info ? "text-teal-900" : "text-gray-800"}`}>{it.text}</div>
                {it.note && <div className="mt-0.5 text-[13px] text-gray-500">{it.note}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Callout({ variant, title, body }: { variant?: string; title?: string; body: string }) {
  const warn = variant === "rule" || variant === "warning";
  const cls = warn ? "border-amber-200 bg-amber-50 text-amber-900" : "border-teal-100 bg-teal-50 text-teal-900";
  const Icon = warn ? AlertTriangle : Info;
  return (
    <div className={`my-3 flex gap-2.5 rounded-lg border p-3 ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-none" />
      <div>
        {title && <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide">{title}</div>}
        <div className="text-sm leading-relaxed">{body}</div>
      </div>
    </div>
  );
}

function Comparison({ title, columns }: { title?: string; columns: { label: string; tone?: string; items: string[] }[] }) {
  return (
    <div className="my-3">
      {title && <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {columns.map((c, i) => {
          const bad = c.tone === "bad";
          return (
            <div key={i} className={`rounded-lg border p-3 ${bad ? "border-red-100 bg-red-50" : "border-green-100 bg-green-50"}`}>
              <div className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${bad ? "text-red-700" : "text-green-700"}`}>{c.label}</div>
              <ul className="space-y-1">
                {c.items.map((it, k) => (
                  <li key={k} className={`flex gap-1.5 text-sm ${bad ? "text-red-900" : "text-green-900"}`}>
                    <span aria-hidden>{bad ? "✗" : "✓"}</span><span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LessonBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-1">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "prose": return <Prose key={i} md={(b as { md: string }).md} />;
          case "steps": return <Steps key={i} title={(b as any).title} steps={(b as any).steps || []} />;
          case "example": return <Example key={i} title={(b as any).title} intro={(b as any).intro} items={(b as any).items || []} />;
          case "callout": return <Callout key={i} variant={(b as any).variant} title={(b as any).title} body={(b as any).body} />;
          case "comparison": return <Comparison key={i} title={(b as any).title} columns={(b as any).columns || []} />;
          default: return null;
        }
      })}
    </div>
  );
}
