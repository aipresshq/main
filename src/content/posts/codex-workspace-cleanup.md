---
title: 'How to set up a safe weekly cleanup for Codex workspaces'
description: 'A careful way to remove stale generated files around Codex without touching active projects, recent logs, or anything you still need.'
author: 'tejas-telkar'
pubDate: 2026-08-04
updatedDate: 2026-08-04
format: 'tutorial'
cover: '/images/codex-workspace-cleanup.png'
coverAlt: 'Laptop showing an abstract file cleanup workspace beside a tray of sorted documents'
coverCredit: 'Illustration: aiPressHQ'
takeaways:
  [
    'Clean a directory you own instead of guessing which internal Codex files are safe to remove.',
    'Start with a dry run that lists old files before any deletion is allowed.',
    'Keep recent files, active work, lock files, and anything inside a working repository out of the sweep.',
    'A recurring Codex automation can run the review, but local automations need the app and computer to be available.',
  ]
factsTable:
  columns: ['Question', 'Safe answer', 'Why it matters']
  rows:
    - [
        'What should be cleaned?',
        'Only a dedicated directory containing disposable caches, temporary exports, or archived logs.',
        'A named boundary is safer than a broad search through a home folder or project.',
      ]
    - [
        'How old is old?',
        'Use a policy such as 30 days for cache and temporary files, and 90 days for logs.',
        'The age is a decision you can change after seeing real usage, not a Codex default.',
      ]
    - [
        'What happens first?',
        'The workflow prints candidate files and stops for review.',
        'A dry run makes an accidental path or pattern visible before anything disappears.',
      ]
    - [
        'Can Codex run it weekly?',
        'Yes, as a user-defined recurring task with a narrow scope and a review step.',
        'The schedule is your workflow. It is not proof that every local Codex folder is disposable.',
      ]
tags: ['OpenAI', 'Tutorials']
postType: 'evergreen'
featured: false
---

AI coding tools leave behind more than source files. A long project can collect temporary exports, stale cache entries, old session logs, and downloaded artifacts that are useful for a while and then quietly become clutter.

That does not mean you should search for a folder named `codex` and delete it. Codex can work with files on your computer, and the [Codex CLI guide](https://help.openai.com/en/articles/11096431) describes it as a local terminal tool that reads, modifies, and runs code in your environment. The safest cleanup is therefore a small maintenance job around a directory you control, not a guess about the tool's private storage.

## Start with a clear boundary

Create one directory for disposable artifacts, or choose one that already exists. Keep it separate from the repository that contains your application code.

For example:

```sh
mkdir -p "$HOME/Codex-artifacts"/{cache,tmp,logs}
```

The directory name does not matter. The boundary does. If a cleanup job can reach source code, credentials, a database dump, or a live project, it is too broad.

If the files you want to remove currently sit in several places, move only known disposable output into this directory first. Do not make the cleanup script discover those locations by searching your whole home folder. That turns a simple maintenance task into a permissions and recovery problem.

## List candidates before touching them

The first version of the job should only print files. On macOS and Linux, `find` can filter by age without changing anything:

```sh
ROOT="$HOME/Codex-artifacts"

find "$ROOT/cache" "$ROOT/tmp" \
  -type f -mtime +30 -print 2>/dev/null

find "$ROOT/logs" \
  -type f -mtime +90 -print 2>/dev/null
```

Here, 30 and 90 are policy choices. They are not Codex settings. A cache used every day may be worth keeping longer. A log needed for a support investigation may need to stay indefinitely.

Read the list. Check the paths. Open a couple of files if the names are not clear. If the output includes a source file, a lock file, or a directory you did not create for disposable data, stop and narrow the root before going further.

## Protect active work

Age alone is not enough. A file can be old and still be important. Before a scheduled sweep, keep these rules in place:

- Never delete files from the active project directory.
- Do not remove lock files, configuration files, credentials, or files with an unknown purpose.
- Keep recent files even when they match an old-file pattern.
- Leave anything tied to an open task or a running process alone.
- Keep a copy of logs that document a failure you are still investigating.

For a repository, check its state separately:

```sh
git status --short
```

This command does not make the cleanup safe by itself. It simply reminds you that generated files and untracked files can look alike. The cleanup root should remain outside the repository whenever possible.

## Make deletion an explicit second step

Once the dry-run list looks correct, use a separate command for removal. Keeping the print step and the delete step apart makes the workflow easier to inspect and easier to disable.

```sh
ROOT="$HOME/Codex-artifacts"

find "$ROOT/cache" "$ROOT/tmp" \
  -type f -mtime +30 -print -delete 2>/dev/null

find "$ROOT/logs" \
  -type f -mtime +90 -print -delete 2>/dev/null
```

The command still has a narrow scope, but it is not a substitute for a backup. If you are cleaning a new directory, run the print-only version for a few weeks first. You will learn whether the age rules fit your work before you make deletion routine.

If you want an extra pause, send old files to a dated archive folder instead of deleting them. That uses more disk space, but it gives you a way back when a task turns out to need an older log.

## Turn the review into a weekly automation

OpenAI's [Codex automations guide](https://openai.com/academy/codex-automations/) describes recurring tasks as user-defined workflows. It gives cleanup work as one example, while also noting that local automations work best when the computer is awake and Codex is running.

The instruction should describe the boundary and the order of operations. A useful version looks like this:

```text
Every Friday at 7:00 PM local time, review the disposable artifacts in
~/Codex-artifacts.

First list cache and temporary files older than 30 days and log files older
than 90 days. Do not inspect or change any other directory. Do not touch
active, recent, locked, ambiguous, or repository files. Show the full list
and the total size. Stop after the report and wait for approval before
deleting anything.
```

That first automation should report, not delete. After several clean reports, you can decide whether the second step should be automatic. For a personal machine, asking for approval is usually worth the extra click. It keeps an unexpected path or an unusually large cleanup from becoming a surprise.

## What the workflow should report

A useful maintenance report is short. It should include the directories it inspected, the age rules it used, the number of files found, the total size, and any paths it skipped. If the job cannot explain what it did, it should not be given permission to remove anything.

You can measure the result with:

```sh
du -sh "$HOME/Codex-artifacts" 2>/dev/null
```

Keep the report for a little while if you are tuning the rules. A sudden jump in the cache or log total may point to a real workflow problem, such as a failing command that keeps writing the same error or a task that is exporting the same file repeatedly.

## When the cleanup should stop

Stop the job if it finds files outside the disposable root, if a task is still running, or if the machine is low on disk space and you feel pressured to remove things quickly. Time pressure is when broad delete commands become most dangerous.

Also stop if the same files return immediately after every sweep. That usually means the application is using them, a process is stuck, or the cleanup boundary is wrong. Deleting them again will hide the symptom without fixing the cause.

## The practical setup

The clean version of this workflow has four parts. A dedicated directory keeps the scope understandable. A dry run shows what would happen. A human review protects active work. A weekly schedule keeps the task from becoming a forgotten manual chore.

Codex can help carry out the review, but the safety comes from the boundaries you define. Do not grant a maintenance prompt more access than the task needs, and do not treat an automation schedule as evidence that a file is safe to delete. A little restraint keeps a tidy workspace from becoming a recovery exercise.
