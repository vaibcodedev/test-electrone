-- Full-text index across all modules. Maintained by SearchIndex (src/main/services/search-index.ts).
-- unicode61 + remove_diacritics handles Cyrillic and Latin; prefix queries ("хук*") are used for typeahead.
CREATE VIRTUAL TABLE `search_index` USING fts5(
  `entity_type` UNINDEXED,
  `entity_id` UNINDEXED,
  `title`,
  `body`,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);
