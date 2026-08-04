---
title: 'How to turn a product page into a launch video with Motion and Claude'
description: 'A practical guide to the URL-to-video workflow, the review points it saves, and the decisions a human still needs to make before publishing.'
author: 'tejas-telkar'
pubDate: 2026-08-04
updatedDate: 2026-08-04
format: 'tutorial'
cover: '/images/motion-claude-launch-video.png'
coverAlt: 'Product page flowing into a storyboard of launch video frames on a dark studio monitor'
coverCredit: 'Illustration: AIPressHQ'
takeaways:
  [
    'Start with a product page, a defined audience, and one outcome instead of asking for a generic marketing video.',
    'Let the first pass handle the repetitive work, then review the script, narration, claims, visuals, and pacing separately.',
    'Add approved footage, logos, interface captures, and brand direction early so the draft has useful material to work with.',
    'Natural-language revisions are useful, but a polished render still needs a factual, rights, and brand review before it goes live.',
  ]
factsTable:
  columns: ['Stage', 'What the workflow can handle', 'What you still need to check']
  rows:
    - [
        'Brief',
        'Use a product URL, audience, outcome, duration, and format as the starting direction.',
        'Whether the page contains the current and accurate product facts.',
      ]
    - [
        'First cut',
        'Plan scenes, create motion, add voiceover, music, captions, and render a draft.',
        'Claims, pronunciation, pacing, accessibility, and visual accuracy.',
      ]
    - [
        'Revision',
        'Request a shorter cut, a different musical feel, or a change to the emphasis in plain language.',
        'Whether the change improves the story instead of only making it faster or louder.',
      ]
    - [
        'Branding',
        'Build around supplied footage, interface captures, logos, and style references.',
        'Usage rights, export sizes, safe areas, contrast, and the final call to action.',
      ]
tags: ['Anthropic', 'Tutorials']
postType: 'evergreen'
featured: false
---

A product launch usually starts in the wrong place. Someone writes a release note, gathers a few interface captures, and only later asks how to turn the material into a video. By then, the important decisions are scattered across documents, chats, and half-finished drafts.

[Motion's product material](https://motion.so/) points in the other direction. It describes an agent that can read a site, plan a video scene by scene, build the visuals and motion, add voiceover, music, and captions, and accept follow-up edits. Motion also documents a connection to Claude through the Model Context Protocol, or MCP. That makes the interesting part less about generating a clip and more about moving a launch brief through a usable production loop.

The workflow is promising, but it is not a reason to skip editorial judgment. A product page can be incomplete. A script can make a careful claim sound bigger than it is. A rendered video can look finished while still sending the wrong message. The useful setup keeps the speed and keeps the review.

## Start with the job the video needs to do

Do not begin with “make a cool launch video.” That gives the system too much room to invent a tone, an audience, and a promise.

Start with five decisions:

- Who should watch the video?
- What changed for that person?
- What should they remember after thirty seconds?
- Where will the video appear?
- What should the viewer do next?

The product URL is the source of context, not the brief itself. A page may explain features without explaining the order in which a new customer should understand them. Your instruction needs to supply that order.

For a new developer tool, the job might be to show the problem, demonstrate the smallest useful result, and send the viewer to a trial page. For a consumer product, the job might be to show the moment of use and leave the viewer with one reason to care. The same URL can support both stories, but the cuts should not be identical.

## Give the first pass enough material

[Motion's launch-video guidance](https://motion.so/blog/how-to-turn-a-product-launch-into-a-video) recommends combining the product page with context such as release notes, interface captures, a customer persona, a landing page, and a visual reference. The principle is simple: the more specific the inputs, the less the first cut has to guess.

Upload the assets you are actually allowed to use. That can include a logo in a clean format, product images with current interface text, short clips of the product in use, a brand color reference, and a sample of the voice or pacing you want. If a claim is important, give the workflow the page or document where that claim is stated rather than hoping it will infer the wording correctly.

It also helps to specify what should not appear. Say whether the video must avoid invented customer results, unsupported performance numbers, competitor comparisons, or imagery that suggests a feature the product does not have. A short exclusion list can prevent a long cleanup later.

## Let the first cut do the repetitive work

The first render is most valuable when it removes setup work, not when it pretends to be the final answer. A useful first pass can turn a page and a brief into a rough sequence, a script, narration, visual direction, and an export that the team can react to.

That gives you several separate review points:

- **Script:** Does every sentence describe the product fairly?
- **Narration:** Is the voice clear, correctly pronounced, and suited to the audience?
- **Visuals:** Does each frame show the thing being discussed?
- **Pacing:** Does the viewer have enough time to understand the important screen or claim?
- **Ending:** Is there one clear next step rather than a pile of links?

Reviewing these separately matters. A beautiful visual sequence can distract from a weak script, and a strong script can be undermined by a rushed voiceover. Treat the render as a working draft with visible decisions, not as evidence that every decision was correct.

## Connect Motion to Claude when the handoff helps

[Motion's MCP guide](https://motion.so/learn/mcp-video-generation) says it can be called from Claude, ChatGPT, Cursor, and other compatible agents. In practical terms, the assistant can pass a request to Motion, receive status or output, and continue the conversation with a follow-up change instead of making you move the brief between disconnected tools.

That connection is useful when the work already lives in a research or writing conversation. You can ask for a launch concept, tighten the copy, and then send a more precise production request without rebuilding the context by hand.

It is not a guarantee that every Claude setup will have Motion available. MCP access depends on the host, account authorization, and the service connection. Confirm the connection before planning a deadline around it, and keep a manual export path for important launches.

## Revise by describing the result

The strongest part of a conversational video workflow is not the first prompt. It is the follow-up edit.

“Make it shorter” is a useful direction only when the system knows what must survive. Say which section can lose time, which claim is essential, and what the new runtime should be. “Swap the music” is clearer when it includes the desired feeling and the audience's context. A calm product demo, a technical explainer, and a launch announcement should not all use the same energy.

Useful revision instructions are concrete:

- Reduce the runtime to 20 seconds, keep the product demonstration, and remove the second example.
- Keep the opening sentence, replace the generic background with the supplied interface recording, and end on the trial URL.
- Use a restrained instrumental bed, lower it beneath the narration, and keep captions readable on a phone.

The goal is not to issue more commands. It is to explain the editorial result you want.

## Use a prompt that leaves room for review

This is a reusable starting shape, not a script to paste unchanged:

```text
Create a 30-second launch video for [product URL].

Audience: [specific audience]
One promise: [the useful change for that audience]
Destination: [where the video will be published]
Format: [16:9, 1:1, or 9:16]
Tone: [plain description of pace, voice, and visual restraint]

Use only claims supported by the product page and the supplied assets.
First return a scene plan and narration draft. Then create the first cut.
Keep the product interface legible, avoid invented customer results, and end
with one clear call to action. After rendering, list any claims or assets
that need human review.
```

Asking for the scene plan first is a small but important safeguard. It lets you reject a wrong story before time is spent polishing it. It also makes the next instruction more specific because you can point to the scene that needs to change.

## Review the finished video like a launch asset

Before publishing, compare the video with the live product page. Check names, pricing, availability, product states, dates, and any performance language. If the page changed while the video was being made, update the cut or make the date of the video clear.

Then check the material around the claim. Are the interface captures yours to use? Do the people, music, fonts, and stock clips have the right permissions? Does the logo remain readable in every crop? Can someone understand the captions without sound? Does the call to action lead to a page that still exists?

A final review should also ask whether the video is honest about what it demonstrates. A simulated interface, a polished mockup, and a real product recording do not make the same promise. Label the difference when it could affect the viewer's understanding.

## Where this workflow stops

Motion can reduce the distance between a product brief and a watchable draft. It does not know which customer problem matters most to your business, whether a claim has been approved, or whether a launch is ready for public attention. Those are still decisions made by the product and marketing team.

It is also not a one-to-one replacement for a traditional timeline editor. If the work needs frame-level compositing, deep visual effects, detailed sound mixing, or an editable project for another team, a conversational workflow may be the wrong final tool. Use it for the part it handles well, then move the work to a more controlled environment when the production requires it.

## The practical read

The product-page-to-video workflow is useful because it makes iteration cheaper to start. A team can begin with the page it already maintains, add a clear audience and outcome, inspect a scene plan, and ask for focused changes without rebuilding the entire project.

The best result will still feel researched rather than automated. The page supplies facts. The brief supplies the story. The workflow supplies a first cut. A person decides whether the final video is accurate, clear, permitted, and worth publishing.

That division of labor is the part worth keeping. The technology can shorten the path from an idea to a draft, but the quality of a launch video still comes from knowing what to say, what to leave out, and when the work is ready to be seen.
