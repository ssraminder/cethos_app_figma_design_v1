# SOP-OPS-001 — Answering AI Front-Desk Escalations

| | |
|---|---|
| **Document ID** | SOP-OPS-001 |
| **Title** | Answering vendor-management front-desk escalations in `office@cethos.com` |
| **Owner** | Vendor Management |
| **Applies to** | Anyone monitoring `office@cethos.com` |
| **Status** | Active |
| **Related** | SOP-IT-001 (mail infrastructure) |

---

## 1. Purpose

When the AI front desk (the `vm@cethos.com` mailbox) receives an inbound it can't safely answer — a
real question, a status inquiry, a complaint, anything uncertain — it **escalates to a human** by
emailing `office@cethos.com`. This SOP is how you answer it so that (a) the sender gets your reply and
(b) the assistant *learns* the answer for next time.

## 2. What an escalation looks like

- **Subject:** `[Vendor inbox — needs a human] [#ESC-XXXXXXXX] <original subject>`
- **Body:** the AI's one-line summary of what the sender wants, the original sender's name/email, and
  the full original message quoted below a teal callout box.
- The applicant has already received an automatic *"we've received your message, we'll get back to
  you"* holding acknowledgement — so there is **no rush of seconds**, but answer same business day.

## 3. How to answer — the rules that make it work

1. **Just hit Reply and type your answer.** Your reply goes to `vm@cethos.com` (not back to
   `office@`), which relays it to the original sender automatically and saves the Q→A to the
   knowledge base as a *draft*.

2. **Reply from your Cethos address.** Your sending address must end in **`@cethos.com`**,
   **`@vendors.cethos.com`**, or **`@cethoscorp.com`**. If you reply from a personal account
   (Gmail, etc.), the system will **not** recognise you as staff and your answer will **not** be
   relayed to the applicant. ⚠️

3. **Keep `[#ESC-XXXXXXXX]` in the subject line.** This token is how the system matches your answer
   back to the original conversation. Don't delete it, and don't let a signature/cleanup tool strip
   bracketed text.

4. **Write the answer for the applicant's eyes.** Your message is sent to them (the system lightly
   polishes grammar/tone but **adds no facts**). Don't include internal-only notes, pricing logic, or
   scoring details in the reply body — those would go straight to the applicant.

5. **You don't add a greeting or sign-off.** The email template adds "Hi <name>," and the Cethos
   Vendor Management sign-off. Just write the substance.

## 4. What happens after you reply

- Your answer is emailed to the original sender **from `vm@cethos.com`**, threaded into their
  conversation.
- The escalation is marked **answered** (with your email and timestamp).
- The question + your **actual** answer (not the polished copy) is saved as a **draft knowledge-base
  entry** (`cvp_kb_entries`, status `draft`). A human still has to approve it before the assistant can
  ever reuse it to auto-answer — your reply alone never makes the bot answer that way automatically.

## 5. Don't

- Don't reply from a non-Cethos address (breaks relay + learning — see §3.2).
- Don't strip the `[#ESC-…]` token (breaks matching).
- Don't make commitments, quote rates, or share internal scoring in the reply body — it goes to the
  applicant.
- Don't set an Out-of-Office auto-reply on `vm@` or `office@` that could ping-pong with the assistant.

## 6. If your answer doesn't seem to reach the sender

Check, in order: (1) Did you reply from a Cethos address? (2) Is the `[#ESC-…]` token still in the
subject? If both are fine and it still failed, raise it with IT (see SOP-IT-001 §10 — likely a Brevo
sender or forwarding issue), and contact the applicant directly in the meantime.
