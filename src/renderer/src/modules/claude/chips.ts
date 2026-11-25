/**
 * Moved to components/common/filter-helpers (they serve every list with FilterChips and NoResults).
 * Kept as a re-export for the modules outside «Знання» that still import from here; new code imports the common file.
 */
export { noResultsHint, presentChips } from '@/components/common/filter-helpers'
