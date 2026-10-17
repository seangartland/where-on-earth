# Passport Group by plan report

Date: 2026-10-17. Design only. No product code or data changed.

Delivered `docs/passport-groupby-plan.md`, grounded in `src/meta/passport.js`.

The recommendation is to replace the rarity filter with Group by Continent, Country, Difficulty, or None; keep status filtering and independent within-group sorting; use Continent by default; give Landmarks the same model; and keep the Countries tab.

The central product finding is that Group by Country does not replace Countries. It exposes place cards under as many as 202 headings, while the existing tab provides a compact completion overview, flags, best postcard covers, complete-country treatment, country ranking, and a detail page. The plan compares three end states and recommends preserving that player value.

The storage finding is also explicit: `where-on-earth-passport-status` stores only the Places status set. Difficulty is not persisted inside it, so removing rarity needs no migration. The existing `where-on-earth-collapsed-continents` key remains continent-only. Persisting new grouping or accordion state is left as a numbered Sean decision rather than assumed.

The plan includes exact panel and pill copy, group head semantics, sorting and filtering composition, accordion rules, three render-ready 390px states, phased dark-to-live implementation, pp harness regressions, and ten decisions with recommendations.

