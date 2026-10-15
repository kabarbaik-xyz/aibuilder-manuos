---
name: ManuOS
description: Quiet, precise interfaces for manufacturing decisions.
colors:
  primary: "#2459df"
  primary-hover: "#1947bf"
  primary-soft: "#edf2ff"
  background: "#f5f7fb"
  surface: "#ffffff"
  surface-muted: "#f8f9fc"
  ink: "#182438"
  muted: "#627086"
  line: "#e7ebf2"
  success: "#14775d"
  success-soft: "#edf8f3"
  warning: "#985715"
  warning-soft: "#fff7e9"
  danger: "#b43e43"
  danger-soft: "#fff0f0"
typography:
  heading:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.55
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 650
rounded:
  control: "8px"
  panel: "14px"
spacing:
  tight: "8px"
  group: "16px"
  panel: "24px"
  page: "36px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "38px"
    padding: "0 15px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
---

## Overview

The provided blue-and-white references evolve into one consistent operating interface. Balanced density: essential facts and actions are visible; secondary evidence opens in a detail panel. The signature interaction is a recovery review that connects the disruption, available choices, approval, and the updated customer promise.

## Colors

Blue identifies the primary action and current navigation. Green means verified or ready; amber means attention, pending readiness, or blocked work. Every state also has a text label. White panels sit on a cool neutral ground. Never use a healthy color to conceal a delayed shipment.

## Typography

Self-hosted Plus Jakarta Sans across all roles. Headings have deliberate scale; compact operational labels use the same family. Numeric values are tabular where they change. Supporting functional text has an 11px minimum in this artifact; product development should prefer 12–14px where density allows. English, sentence case, concise verbs.

## Layout

One sidebar, one utility header. Do not repeat primary navigation across both. Desktop rail is 228px, narrowing to210px before collapsing below851px. Desktop pages have36px padding; mobile17px. Content/detail compositions collapse into one column on mobile. Tables and dependency graphs scroll inside their own regions without widening the page. Preserve information relationships rather than squeezing every column.

## Elevation & Depth

Panels use hairline borders. Neutral soft shadows are reserved for overlays and transient feedback. No colored glow. UI motion is limited to short state transitions, with reduced-motion support.

## Shapes

Gently rounded panels, more compact rounded controls. Pills and badges are small status indicators, never large content containers. Icons share one authored SVG stroke system.

## Components

- Primary buttons: one main decision per local flow, with verbs naming the action.
- Tables: order identity, verified quantity, promised/expected dates, explicit status, and detail entry.
- Metric strips: grouped facts with thin separators rather than five decorative cards.
- Recovery: focused side panel, available options, infeasibility reasons, consequences, explicit confirmation.
- Progress: completed output, QC-passed output, and shipment allocation are separate concepts.
- Detail panels: native dialogs support Escape, focus containment and background interaction protection.
- Feedback: short toast plus persistent updated content; errors remain close to their fields.
- Blueprint/network/dependency illustrations: meaningful vector diagrams, with textual equivalents and labels.

## Do's and Don'ts

- Keep the next action clear; make supporting evidence available without long introductory prose.
- Use the same labels, dates, quantities and statuses across persona views.
- Require review before consequential changes. Do not auto-apply a recommendation.
- Do not imply real telemetry, cryptographic certification, live AI or external message delivery in this HTML prototype.
- Avoid decorative photography, repeated navigation, oversized empty cards, dense nested panels and badges on every sentence.
- Do not treat this prototype's client-side role switching as production access control.
