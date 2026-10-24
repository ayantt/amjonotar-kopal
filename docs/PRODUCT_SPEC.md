# Product Specification

## Overview
**Title:** আমজনতার কপাল (Amjonotar Kopal; roughly “The People's Fate”)  
**Genre:** satirical property/economy board game  
**Platform:** responsive browser app; four players sharing one device  
**Status:** specification/scaffold

The game uses a familiar roll-move-property-rent-cards loop. Its central asymmetry is institutional: the Politician receives privileges while Citizens bear fees and service failures. Citizens win only through coordinated action.

## Goals
- Playable, understandable, replayable local game.
- Satire expressed through mechanics, fictional spaces, card text, and event log.
- Strong Politician advantage but a meaningful Citizen cooperative path.
- Deterministic, testable rules and simple local setup.

## MVP non-goals
No online multiplayer, accounts, AI opponents, real-money transactions, analytics/backend, or identifiable real-world political actors. Do not copy Monopoly branding, board art, or card text.

## Seats
Exactly one Politician and three Citizens. Each player has an individual token and cash balance; Citizens share a cooperative victory objective. Politician acts first.

## Core loop
Start game → active player rolls role-appropriate dice → move and resolve GO → resolve destination → offer legal actions → log events → check victory → advance turn unless game over.

## Experience
- 40-space perimeter board with original fictional Bangladesh-inspired names.
- Show current player, role, cash, ownership, development, funds, and available actions.
- Disable illegal actions; explain automatic transfers in a readable log.
- Distinguish public treasury from Citizens' cooperative fund.
- Cards resolve through typed engine effects.
- Game over is terminal and offers restart.
- Bangla-ready copy, responsive layout, keyboard-accessible controls, labels beyond color.

## Visual direction
Bold, colorful, editorial satire influenced by fictional election posters, receipts, and public notices. Readability before decoration. Satirize systems and power structures, not protected groups or real individuals.

## Success criteria
A user can start and finish a game without dev tools; rules are consistent; Citizen cooperation is understandable; engine tests cover core mechanics/victory; clean checkout builds.
