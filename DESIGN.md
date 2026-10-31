---
name: AI Business Academy
description: One clear action, one inspectable result.
colors:
  action-red: "#cf352c"
  action-red-hover: "#b62d25"
  shell-ground: "#111315"
  shell-surface: "#20252d"
  shell-control: "#252931"
  demonstration-ground: "#191c20"
  work-paper: "#f3f4f6"
  field-paper: "#ffffff"
  work-ink: "#20242c"
  entry-ink: "#15171b"
  light-ink: "#f7f7f8"
  secondary-ink: "#bcc6d7"
  paper-secondary-ink: "#626b79"
  shell-line: "#343941"
  paper-line: "#dadddf"
  focus-blue: "#7aa9e8"
  success-paper: "#dceec4"
  success-ink: "#28431d"
typography:
  display:
    fontFamily: "Manrope Variable, Manrope, sans-serif"
    fontSize: "clamp(34px,3.9vw,54px)"
    fontWeight: 720
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Manrope Variable, Manrope, sans-serif"
    fontSize: "clamp(28px,3vw,40px)"
    fontWeight: 680
    lineHeight: 1.16
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Manrope Variable, Manrope, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Manrope Variable, Manrope, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontFamily: "Manrope Variable, Manrope, sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  field: "3px"
  control: "8px"
  shell-control: "9px"
  compact-panel: "12px"
  panel: "14px"
  tag: "20px"
  demonstration: "16px"
spacing:
  compact: "8px"
  control-gap: "12px"
  group: "16px"
  section: "24px"
  work-padding: "34px"
  desktop-gutter: "38px"
components:
  button-primary:
    backgroundColor: "{colors.action-red}"
    textColor: "{colors.field-paper}"
    rounded: "{rounded.shell-control}"
    padding: "12px 17px"
  button-primary-hover:
    backgroundColor: "{colors.action-red-hover}"
  button-secondary:
    backgroundColor: "{colors.shell-control}"
    textColor: "#f0f2f6"
    rounded: "{rounded.shell-control}"
    padding: "12px 17px"
  task-field:
    backgroundColor: "{colors.field-paper}"
    textColor: "{colors.work-ink}"
    rounded: "{rounded.field}"
    padding: "12px 13px"
  work-surface:
    backgroundColor: "{colors.work-paper}"
    textColor: "{colors.work-ink}"
    rounded: "{rounded.panel}"
    padding: "31px 34px 24px"
  goal-demonstration:
    backgroundColor: "{colors.demonstration-ground}"
    rounded: "{rounded.demonstration}"
    padding: "30px 24px"
  nav-active:
    backgroundColor: "{colors.work-paper}"
    textColor: "#1a1d24"
    rounded: "{rounded.shell-control}"
    padding: "12px 13px"
---
# Design System: AI Business Academy

## Overview

**Creative North Star: "A visible purpose, a direct action, an inspectable result."**

The operating product is a clear, adult workspace: a graphite shell establishes location, cool white paper makes the current work readable, and restrained red identifies an action or active detail. Manrope and the established silver-blue Academy logo carry the identity. Preserve that logo as an asset; do not redraw or recolor it to match the action accent.

This direction supersedes the earlier blue-glass and mountain treatment within the operating core. The optional spatial map, immersive learning surfaces and independent editing modules retain their own functional needs. Designs generated for a customer's website or brand establish their own visual identity; the Academy shell palette does not constrain those deliverables.

**Key Characteristics:**
- Clear location and a visible next action.
- Quiet graphite framing around readable working paper.
- Small red emphasis, with silver-blue identity and visible keyboard focus.
- Bounded, interruptible motion that respects reduced-motion preferences.

## Colors

The palette is neutral and cool, with a warm red action accent.

### Primary
- **Action Red:** primary actions, selected entry details and small directional accents. Use its deeper hover variant for the same action.

### Neutral
- **Graphite Ground:** the operating shell and persistent navigation.
- **Graphite Surface / Control:** supporting cards and secondary controls on dark surfaces.
- **Demonstration Ground:** the single contained home demonstration stage.
- **Cool Work Paper / Field Paper:** the home canvas, current work, featured content and writable fields.
- **Work Ink / Entry Ink:** readable content on paper.
- **Light Ink / Secondary Ink:** primary and supporting text on graphite.
- **Paper Secondary Ink:** supporting text on cool paper; check the actual surface before reusing it.
- **Shell Line / Paper Line:** restrained dividers and structural edges.

### Functional color
- **Focus Blue:** keyboard focus, separate from the action accent.
- **Success Paper / Success Ink:** confirmed completion states, separate from selection or an animation.

**The Action Rule.** Red identifies a useful action or state; it does not flood the shell, replace the logo, or stand in for real progress.

## Typography

**Display and Body Font:** self-hosted Manrope Variable, with Manrope and sans-serif fallbacks. Keep Bulgarian text fully supported.

The type is direct and readable. Use weight and space to distinguish hierarchy; avoid decorative casing and excessive emphasis. The frontmatter records the entry display, working headline, destination title, body and label roles. Compact metadata may be smaller, but essential actions and working copy must remain legible.

Entry display text is balanced and tightly tracked. Working headings are calmer and lighter. Supporting paragraphs usually stay within a readable measure (about 65ch); generated documents may keep the detail their purpose requires. Use tabular numerals for timers and actual counts.

**The Literal Label Rule.** Navigation names the visible destination. Controls name their actual action. Saving, generating, reviewing, approving and publishing remain visibly distinct states.

## Layout

The operating shell uses a persistent desktop sidebar (214px), a top bar (72px), and a content area with generous outer space. Below the drawer breakpoint (1100px), remove the sidebar offset and use the accessible navigation drawer (250px). Preserve its clear trigger, Escape dismissal and focus containment. At the compact breakpoint (760px), the top bar is shorter (66px), content gutters narrow, and search remains reachable.

Home uses a centered content width (1140px). Working and supporting surfaces can use their own content measure instead of forcing one universal grid. Related controls stay together; supporting destinations use disclosure rather than competing with the first useful choice. Layouts collapse into a readable single column on phones, without horizontal page overflow.

## Elevation & Depth

The operating core is flat at rest. Contrast between graphite, cool paper and quiet dividers establishes hierarchy. Do not restore the earlier blue-glass gradients, atmospheric backdrop or pervasive glow within this core.

Use soft shadows only where they explain a temporary layer or a preview artifact. Paper artifacts lift inside the graphite demonstration stage; menus, search results and toasts separate from the page beneath. Task sheets, regular cards and primary buttons do not need ambient shadows.

The optional 3D workflow map keeps true perspective, prepared reflections and independent camera movement. Load it on request; pause it when hidden or offscreen and stop camera movement after settling. Selecting a node is navigation, not evidence that a job ran.

**The Bounded Motion Rule.** Motion explains a goal, acknowledges a press or distinguishes a temporary layer. Shell routes use an opacity-only arrival (180ms); ordinary color changes use (160ms). Home scenes arrive once and settle (250ms), fading from a small vertical offset (7px). The sample publication has one small rule reveal ending at (600ms). Direct actions remain usable throughout. Remove nonessential sequences, spatial movement and backdrop blur for reduced motion; never add continuous WebGL or background animation to entry.

Run home demonstration sequences only while the stage intersects the viewport and the document is visible. A new desktop hover or keyboard focus replaces the current scene without queuing work. On phones, omit the desktop stage and use large visible goal labels with Phosphor icons. The labels carry the information without miniature interface text or animation.

## Shapes

Use gently curved, compact controls and quiet paper panels. Controls generally use the control and shell-control radii; working panels use the panel radius and become slightly tighter on phones. Task fields retain their sharper field radius; daily-plan fields can use the control radius. Roundness communicates the component's role rather than making every surface a pill.

Straight dividers organize entry choices and saved work. Reserve circles for avatars, focus dials and genuine status marks. Do not frame every paragraph or action as a separate card.

## Components

### Buttons
Primary buttons are solid Action Red with white text and a deeper red hover. Standard shell buttons have a minimum height (46px); prominent working actions may be taller. Secondary buttons use a restrained dark fill or clear border appropriate to their background. Keep a visible focus outline (3px) with an offset (4px); never rely on color change alone.

Disabled, loading, failure and completion states must communicate the actual operation. Utility controls retain usable targets; do not shrink an essential action into metadata. A short press response may compress an enabled button (scale .975, 120ms); it acknowledges input without delaying the action.

### Inputs / Fields
Fields use explicit labels, concrete examples and readable text. Paper task fields use a white fill, dark ink and a clear border. The modal and dark conversation editor use a distinct dark field treatment with sufficient contrast. Preserve editing, approval, save and publish behavior inside each module rather than merging those operations into a single decorative control.

### Navigation
The graphite sidebar exposes the core destinations. The selected item uses cool paper with dark text and a small red icon accent. Personal destinations use a native disclosure. The mobile drawer must keep the current location clear and the account row readable. Product description, copyright and feedback access live in the **За платформата** dialog opened from the sidebar, keeping repeated information out of each working surface.

Within workflow, keep the primary task destinations visible. Saved project history is labeled **Моите задачи**. Additional mobile destinations are consolidated under **Още**; show project context and new-task header controls when an active project or role makes them relevant. The optional map stays reachable without becoming a prerequisite.

### Cards / Containers
Working paper is for the current task and readable results. Dark supporting cards remain quiet, with modest radius and minimal borders. Featured community content can use paper to establish priority; real participants, posts and replies supply the content. Do not illustrate people with fabricated member imagery.

### Chips / Status
Category tags are compact, outlined labels. Selected filters use paper and dark text. A tag, counter or success mark must represent a real category, selection or saved state; never invent activity or achievement to populate a design.

### Goal Entry
Each home goal is a direct button that immediately opens its exact destination. Desktop hover or keyboard focus selects one code-native sample within a single graphite stage: a publication, a flat service webpage with an inquiry action, an inquiry with a prepared reply awaiting human review, or a one-task focus panel. Each scene has an explicit sample caption and represents an example rather than live job execution. The scene arrives briefly and settles. Avoid a collage of simultaneous concepts.

On phones, large goal labels and simple Phosphor icons keep each destination readable; omit the desktop preview stage and do not shrink an interface into a thumbnail. The samples and icons are decorative and hidden from assistive technology. Visible labels explain the action without relying on miniature text or animation. Touch opens the destination directly. The saved-work row uses real saved work, and a real example remains secondary and useful.

### Dialogs / Feedback
Use the existing native dialog behavior for temporary information: clear title, visible close action, keyboard dismissal and focus return. The opening motion is brief (220ms) and resolves from a small offset and scale. The About dialog preserves the established product description, copyright and community feedback action. On mobile, close the navigation drawer before opening it and return focus to the menu trigger.

A toast remains an actual status message. Its check may use a brief confirmation motion (240ms); the animation does not create a new claim of saved, approved or published work. Preserve the message, dismissal and accessible status semantics when motion is disabled.

### Task Workspace
The current task is the working surface. Offer spatial exploration explicitly instead of loading the map at entry. Business stage changes inline. Preserve exact task selection across reload and registration, and keep real saved artifacts and brand context reachable through their existing modules.

## Do's and Don'ts

### Do:
- **Do** preserve the established silver-blue Academy logo.
- **Do** use graphite framing, cool paper and restrained red within the operating core.
- **Do** expose a direct next action and keep saved work reachable.
- **Do** let each sample settle, gate its motion when offscreen or in a hidden tab, and use large labels with simple icons on phones.
- **Do** retain visible keyboard focus, readable contrast, responsive controls and reduced-motion support.
- **Do** preserve the optional map and each editing module's independent behavior.
- **Do** give generated customer websites and brands their own appropriate visual identity.

### Don't:
- **Don't** restore blue glass, mountain atmosphere, neon noise or a cluttered collage in the operating core.
- **Don't** require the 3D map, a preview tap, an animation to finish or an extra confirmation before the selected entry task.
- **Don't** obscure navigation, overload the first view, or duplicate supporting calls to action.
- **Don't** use invented activity, testimonials, progress or completed AI work as visual content.
- **Don't** equate a timer, preview, animation or selected map node with verified work, mastery or measured retention.
