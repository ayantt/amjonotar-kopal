# Product Specification

## Overview
**Title:** আমজনতার কপাল (Amjonotar Kopal; roughly “The People's Fate”)  
**Genre:** satirical property/economy board game  
**Platform:** responsive browser app; one human versus three local AI opponents  
**Status:** specification/scaffold

The game uses a familiar roll-move-property-rent-cards loop. Its central asymmetry is institutional: the Politician receives privileges while Citizens bear fees and service failures. Citizens win only through coordinated action. The human competes against three computer-controlled seats, not other local human players.

## Goals
- Playable, understandable, replayable single-player game.
- Satire expressed through mechanics, fictional spaces, card text, and event log.
- Strong Politician advantage but a meaningful Citizen cooperative path.
- AI opponents that make legible, role-appropriate decisions.
- Deterministic, testable rules and simple local setup.

## MVP non-goals
No local pass-and-play, online multiplayer, accounts, remote AI APIs, real-money transactions, analytics/backend, or identifiable real-world political actors. Do not copy Monopoly branding, board art, or card text. AI logic runs locally and does not require network access.

## Seats and role selection
Exactly four seats: one human-controlled seat and three AI-controlled seats. The human chooses Politician or Citizen. The remaining seats are assigned roles so the match always contains exactly one Politician and three Citizens. If the human chooses Politician, all three Citizens are AI-controlled and must cooperate. If the human chooses Citizen, the Politician and the other two Citizens are AI-controlled. Player names, token colors, and AI personality labels should be configurable presentation data, not rules.

## AI behavior
- AI takes turns automatically and should not require the human to click through routine actions.
- AI may choose only legal actions exposed by the engine; the engine validates every choice.
- AI must use only information available to that player and public game state.
- Citizens should coordinate around shared objectives using the shared cooperative fund and explicit contribution/voting mechanics, without secret communication.
- AI decisions should be logged in plain language and visible in a compact event log or expandable reasoning panel.
- Provide a brief animation or status indicator during AI turns and a way to reduce/skip animation.
- Use a deterministic injectable random source for tests. Avoid unbounded decision loops; each AI turn must resolve or return a safe fallback.

## Core loop
Start game → human chooses role → active player rolls role-appropriate dice → move and resolve GO → resolve destination → engine exposes legal actions → human selects or AI strategy chooses → log events → check victory → advance automatically unless game over.

## Experience
- 40-space perimeter board with original fictional Bangladesh-inspired names.
- Show current player, human/AI status, role, cash, ownership, development, funds, and available actions.
- Disable illegal human actions; AI cannot submit illegal actions.
- Distinguish public treasury from Citizens' cooperative fund.
- Cards resolve through typed engine effects.
- Game over is terminal and offers restart.
- Bangla-ready copy, responsive layout, keyboard-accessible controls, labels beyond color.
- Explain AI actions without exposing hidden information or overwhelming the player.

## Visual direction
Bold, colorful, editorial satire influenced by fictional election posters, receipts, and public notices. Readability before decoration. Satirize systems and power structures, not protected groups or real individuals.

## Success criteria
A user can start and finish a game without dev tools; the user controls exactly one seat; the other three seats act automatically; rules are consistent; Citizen cooperation is understandable; AI completes turns without illegal actions or deadlocks; engine tests cover core mechanics/victory; clean checkout builds.
