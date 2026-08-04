---
title: 'Mako, Koi, and Tune: what a rumored GPT-6 lineup would need to prove'
description: "A rumored three-tier GPT-6 family follows a familiar product strategy. OpenAI's current GPT-5.6 lineup shows what those tiers could mean, and what they still would not prove."
author: 'tejas-telkar'
pubDate: 2026-08-02
updatedDate: 2026-08-03
format: 'analysis'
cover: 'https://pbs.twimg.com/media/HOviCSfXkAEWoPU.jpg:large'
coverAlt: 'Graphic showing three rumored GPT-6 model tiers with different capability and price positions'
takeaways:
  [
    'The rumored Mako, Koi, and Tune names describe a familiar flagship, balanced, and high-volume model strategy.',
    "OpenAI's current GPT-5.6 family already uses Sol, Terra, and Luna as durable capability tiers.",
    'A tier label can suggest a product role, but it cannot establish model quality, pricing, or release status.',
    'A credible GPT-6 announcement would need public model IDs, evaluation details, pricing terms, and access documentation.',
  ]
factsTable:
  columns:
    ['Question', 'What the rumored lineup suggests', 'What current OpenAI material establishes']
  rows:
    - [
        'Tier design',
        'Mako is positioned as the flagship, Koi as the balanced option, and Tune as the high-volume tier.',
        'OpenAI positions GPT-5.6 Sol for complex work, Terra for balance, and Luna for cost-sensitive workloads.',
      ]
    - [
        'Pricing',
        'The proposed family follows a descending price ladder from the most capable tier to the cheapest tier.',
        'The official GPT-5.6 announcement lists Sol at $5 input and $30 output, Terra at $2.50 and $15, and Luna at $1 and $6 per million tokens.',
      ]
    - [
        'Product role',
        'The names imply different tradeoffs in capability, speed, and cost.',
        'OpenAI says the GPT-5.6 tiers are available through ChatGPT, Codex, and the API, with model-specific tools and limits documented publicly.',
      ]
    - [
        'Release status',
        'The rumored names are presented as a possible next generation.',
        "OpenAI's public documentation checked for this article lists GPT-5.6 models, not Mako, Koi, or Tune.",
      ]
tags: ['AI', 'OpenAI']
postType: 'digest'
featured: false
---

The next GPT generation may not arrive as one model. A rumored lineup built around the names Mako, Koi, and Tune points toward a three-tier strategy: a flagship for difficult agentic work, a middle option for everyday tasks, and a lower-cost model for high-volume use.

That structure would be familiar to developers. OpenAI has already moved toward durable capability tiers rather than treating every model release as a single upgrade. The interesting question is therefore not whether the names sound plausible. It is whether a new family could deliver a meaningful difference in completed work, cost, and reliability.

## The important part is the tier strategy

Model names attract attention, but product tiers determine how people actually use an API. A flagship model can justify a higher price when a task is difficult enough that a failed run costs more than the extra tokens. A balanced model is useful when teams need strong results without paying for the maximum reasoning budget every time. A low-cost model matters when the workload is repetitive, latency-sensitive, or large enough for small price changes to add up.

The rumored lineup follows that logic. Mako is presented as the model for ambitious, multi-step work. Koi is framed as the middle choice. Tune is aimed at volume. Those roles are easy to understand because they map to real purchasing decisions: quality first, a practical compromise, or the lowest unit cost.

The labels still do not tell us how large the gaps would be. A cheaper model can be the better choice if it completes a task in fewer turns. A flagship can be poor value if its extra reasoning does not improve the final result. The useful unit is not price per token by itself. It is cost per successful task.

## OpenAI already uses a similar model family

OpenAI's [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model) describes Sol as the frontier option, Terra as the balance of intelligence and cost, and Luna as the efficient choice for high-volume work. Its [public model catalog](https://developers.openai.com/api/docs/models) gives those tiers stable model IDs and explains their intended workloads.

The official [GPT-5.6 announcement](https://openai.com/index/gpt-5-6/) also shows why a future generation might keep this structure. GPT-5.6 is available across ChatGPT, Codex, and the API, while the tiers can be selected according to the job. The number identifies the generation, but the capability names describe the role a model plays inside that generation.

That distinction is important. A future Mako, Koi, or Tune could be a real successor family, but it could also be an internal naming exercise, an experiment in packaging, or a set of ideas that never reaches a public API. Names alone cannot resolve that difference.

## What the pricing pattern would need to explain

The proposed lineup uses the most expensive tier for the hardest work and the least expensive tier for scale. That is a sensible design, but it leaves out the details that make a price comparison useful.

Developers would need to know whether the prices apply to input and output tokens, cached input, batch processing, or a particular product plan. They would also need context limits, maximum output limits, rate limits, and any surcharge for tools. A model that costs less per token can still cost more per completed workflow if it needs longer prompts, more retries, or additional tool calls.

The current GPT-5.6 catalog is a useful example. OpenAI publishes input and output prices for each tier and documents model IDs, context windows, supported tools, and endpoint availability. It also explains prompt caching and the discount for cached input. A future pricing graphic would need the same level of detail before teams could use it for planning.

## Capability claims need a reproducible test

Terms such as "agentic work" and "flagship" describe intent, not performance. They do not say how a model handles a codebase, a long-running research task, a browser workflow, or a production incident.

The strongest comparison would use the same prompts, tools, context, time limit, and success criteria across all tiers. It would report the number of completed tasks, the amount of human correction required, latency, token use, and total cost. A benchmark should also identify the exact model version and reasoning setting, since aliases can change over time.

This matters more than a single leaderboard score. A team choosing a model needs to know whether the extra capability appears in the work it actually does. A coding agent, a customer-support classifier, and a research assistant may reach different conclusions about the same three tiers.

## What a real GPT-6 announcement would include

If Mako, Koi, and Tune become public products, the announcement should be accompanied by more than names and positioning. Developers would need:

- Stable model IDs and a clear relationship between aliases and versions.
- Pricing for normal input, cached input, output, batch work, and tool calls.
- Context and output limits, rate limits, supported endpoints, and supported tools.
- Evaluation results with task definitions, prompts, model settings, and reproducible methods.
- Guidance on migration, safety restrictions, data handling, and model replacement.

Those details turn a product story into something developers can test. Until they appear, the lineup is best understood as a plausible product concept, not a confirmed release plan.

## The useful takeaway

Mako, Koi, and Tune make sense as names for three different jobs. The structure mirrors the direction OpenAI has already taken with Sol, Terra, and Luna, where the model number marks the generation and the tier name signals the tradeoff.

That resemblance is not proof that a GPT-6 family exists. It is a reminder of what the next generation will have to compete on: reliable task completion, transparent pricing, useful tool access, and a clear reason to choose one tier over another. Until OpenAI publishes those details, the names are a theory about product design, not a new set of models developers can use.
