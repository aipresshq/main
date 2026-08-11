// scripts/create-chatgpt-linux-post.mjs
//
// One-off: creates the "ChatGPT desktop app comes to Linux" post as a
// Prismic draft. Run with `node --env-file=.env scripts/create-chatgpt-linux-post.mjs`,
// then publish the pending release in the Prismic dashboard.
import * as prismic from '@prismicio/client';
import { createPrismicWriteClient, PRISMIC_LOCALE, PRISMIC_POST_TYPE } from '../admin/prismic-client.mjs';
import { postPayloadToPrismicData } from '../admin/prismic-write-mapping.mjs';

const UID = 'chatgpt-desktop-linux-preview';

const payload = {
  title: 'OpenAI Brings the ChatGPT Desktop App to Linux. Anthropic Got There First.',
  description:
    "The unified Chat, Work, and Codex app OpenAI shipped for Mac and Windows in July is now in Linux preview as native deb and rpm packages — about six weeks after Claude Desktop's own Linux beta.",
  author: 'tejas-telkar',
  pubDate: '2026-08-12',
  format: 'analysis',
  postType: 'digest',
  cover: 'https://pub-450085b0b9f2461588d49e1539d3420b.r2.dev/chatgpt-desktop-linux-preview.jpg',
  coverAlt:
    "OpenAI's own promotional graphic for the release: white text reading \"ChatGPT Desktop now on Linux\" over a starfield image of the Milky Way",
  featured: false,
  tags: ['AI', 'OpenAI', 'Anthropic', 'Product Launch'],
  takeaways: [
    'OpenAI’s unified ChatGPT desktop app — Chat, Work, and Codex in one window — is now in preview for Linux, shipping as native .deb and .rpm packages for x64 and Arm64.',
    "It's tested on Ubuntu 24.04/26.04 LTS, Debian 13, and Fedora 43/44, but there's no AppImage, Snap, or Flatpak build yet — the format Linux developers have asked for longest.",
    "Anthropic's Claude Desktop got to Linux first, in beta since June 30 — about six weeks ahead of OpenAI, though covering fewer distros and missing computer-use and full voice dictation.",
    "Codex itself isn't new to Linux — it's run there as a CLI since April 2025. What's new is the merged desktop app OpenAI unified for Mac and Windows in July, now extended to Linux.",
  ],
  factsTable: {
    columns: ['Question', "What's confirmed", "What's not confirmed"],
    rows: [
      [
        'What happened',
        'OpenAI put its unified ChatGPT desktop app (Chat, Work, and Codex in one window) into preview for Linux, as native .deb and .rpm builds for x64 and Arm64.',
        "OpenAI hasn't said when the preview leaves beta, or published Linux setup docs the way it has for macOS.",
      ],
      [
        'Which distros',
        'Tested and validated on Ubuntu 24.04 LTS, Ubuntu 26.04 LTS, Debian 13, and Fedora 43/44.',
        'No AppImage, Snap, or Flatpak build — the distro-agnostic format requested longest on OpenAI’s own developer forum.',
      ],
      [
        'How this compares to Anthropic',
        'Anthropic shipped an official Claude Desktop beta for Linux on June 30, roughly six weeks earlier, via an apt repository covering Ubuntu 22.04+ and Debian 12+.',
        "Neither company has said if or when Linux support broadens further — OpenAI already covers Fedora, which Anthropic's beta doesn't.",
      ],
      [
        "What's actually new",
        'Codex has run on Linux as an open-source CLI since April 2025. What’s new is the merged GUI — Chat, Work, and Codex sharing one window — reaching Linux for the first time.',
        "OpenAI hasn't detailed which Codex CLI features, if any, are missing from the desktop app's Codex pane on this initial Linux build.",
      ],
    ],
  },
  body: `OpenAI [posted](https://x.com/OpenAI/status/2087231350134980830) on August 11 that its ChatGPT desktop app — the unified window that bundles Chat, Work, and Codex — is now in preview on Linux. The app ships as native \`.deb\` and \`.rpm\` packages for both x64 and Arm64, [tested and validated](https://www.phoronix.com/news/ChatGPT-Desktop-Linux-Preview) against Ubuntu 24.04 LTS, Ubuntu 26.04 LTS, Debian 13, and Fedora 43/44.

It's the same desktop app OpenAI shipped for macOS and Windows on July 9, when it folded Codex — previously its own standalone app — into a single window alongside Chat and the newer Work mode, an agent-style pane built on the GPT-5.6 model family for tasks that produce a finished artifact — a spreadsheet, a slide deck, a working app — rather than a chat reply. Work isn't a separate pricing tier; it ships on every plan, including Free, the same as Chat and Codex. Linux is the last of the three original desktop platforms to get that unified app, rather than a fourth platform catching up on features the other two already had.

## What's actually new here

Linux developers have had a path to Codex for over a year — it launched as an [open-source CLI](https://github.com/openai/codex) in April 2025 and has run on Linux via npm or a direct binary ever since. What's new in this release isn't Codex on Linux; it's the graphical desktop app — Chat, Work, and Codex sharing one window, one login, one set of project and browser-workflow integrations — reaching Linux for the first time. Anyone already running the Codex CLI in a terminal gets a GUI wrapped around the same product, not a new capability.

The packaging has a gap developers have been flagging since well before this launch: [OpenAI's own community forum](https://community.openai.com/t/request-for-official-linux-desktop-app-for-chatgpt/1029344) has multi-page threads requesting a Linux app, with a recurring follow-up request for a distribution-agnostic AppImage build. This preview ships \`.deb\` and \`.rpm\` only — no AppImage, Snap, or Flatpak — so anyone outside the Debian/Ubuntu/Fedora family is still waiting.

## Anthropic already did this

OpenAI is not first here. [Anthropic shipped an official Claude Desktop beta for Linux on June 30](https://www.omgubuntu.co.uk/2026/07/claude-desktop-linux-beta) — about six weeks ahead of today's ChatGPT preview — distributed through its own apt repository, so updates arrive with normal system updates rather than a manually re-downloaded package. Claude's beta covers Ubuntu 22.04+ and Debian 12+, explicitly excluding Fedora and RHEL-family distros for now, and ships without two features the Mac and Windows builds have: computer-use screen control, and full voice dictation (Linux dictation is limited to the command line).

Measured purely by distro coverage, OpenAI's list is broader out of the gate — it already includes Fedora, which Anthropic's beta doesn't. Neither company has said whether or when that changes. Google's Gemini and Perplexity still have no official native Linux desktop app at all; Linux users of either rely on unofficial community wrappers, not anything the companies ship themselves. On native Linux support, the frontier-lab race so far has exactly two entrants, and OpenAI joined it second.

## What's still open

OpenAI hasn't published Linux-specific setup documentation the way it has for [macOS](https://help.openai.com/en/articles/9395554) — there's no equivalent Linux article in its help center yet, and the app itself is closed-source, so there's no changelog or issue tracker to watch the way Codex's own GitHub repo offers. For now, the download and the four supported distros are the whole of what's public. Whether this stays a preview for weeks or months, and whether an AppImage build follows, are both open questions OpenAI hasn't answered.`,
};

const writeClient = createPrismicWriteClient();
const migration = prismic.createMigration();

migration.createDocument(
  {
    type: PRISMIC_POST_TYPE,
    lang: PRISMIC_LOCALE,
    uid: UID,
    tags: [],
    data: { ...postPayloadToPrismicData(payload), archived: false },
  },
  payload.title,
);

await writeClient.migrate(migration, { reporter: (event) => console.log(event) });
console.log(`\nCreated "${UID}" as a draft. Publish the pending release in the Prismic dashboard to make it live.`);
