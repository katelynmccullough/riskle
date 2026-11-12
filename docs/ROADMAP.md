# Remaining work beyond the local MVP

- Head-to-head and group-winner markets, including ties and unfinished-player rules.
- Automatic daily rollover and archived puzzles; weekly seasons/resets and allowances.
- Invitations, account authentication, league roles and management permissions.
- A real transactional backend, authenticated server-derived settlement and multiplayer synchronization across devices.
- Database migrations for the eventual authoritative engine; review the inactive original Supabase scaffolding before using it.
- Calibrated odds based on a documented, validated model.
- Real third-party integrations only after inspecting permitted visible signals and applicable terms. Actual Wordle detection is currently absent and unverified.
- Broader browser and assistive-technology validation. Current browser automation covers Chrome and an isolated Chromium extension profile.

These are not exposed as nonworking decorative controls in the local demo. No deployment or external-service setup is necessary to play the current MVP.
