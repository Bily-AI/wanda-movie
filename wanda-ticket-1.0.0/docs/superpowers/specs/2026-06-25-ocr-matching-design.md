# Replicating Legacy OCR Matching & Cascading Click Simulation Design

Replicating the robust Levenshtein/LCS scoring matchers for cities, cinemas, movies, dates, showtimes, and seats, along with the dropdown click simulation when applying OCR tickets.

## 1. Context & Objectives
In the legacy electron application, when a ticket image or clipboard text is recognized via Baidu OCR:
1. It parses the text into a candidate ticket layout (cinema, movie, date, showtime, seats).
2. It scores and matches these options against all available real cities, cinemas, movies, dates, and showtimes loaded from the API using an edit distance/LCS algorithm.
3. It performs a cascading asynchronous selection (changing cinema -> waiting for movies list to load -> matching movie -> waiting for dates list -> matching date -> matching showtime -> waiting for seats -> matching seats).
4. If a dropdown is active (or any dropdown is open), it triggers the Element Plus DOM `.click()` event on the next selection wrapper to open it automatically.

The current refactored codebase uses a strict `findUnique` fuzzy include filter which fails whenever multiple cinemas/movies match, returning `undefined` and preventing the selection cascade from proceeding. We will replicate the legacy matching and UI cascade.

---

## 2. Detailed Technical Design

### A. Scoring & Matching Utilities in Pinia Store (`src/renderer/stores/ticket.ts`)

#### 1. Cinema Matcher
Instead of exact or single-match fuzzy include, we implement the legacy scoring algorithm:
- Generate 5 weighted OCR text variants:
  - Raw OCR cinema name (Weight: 1.5)
  - Trimmed & spaces removed (Weight: 1.3)
  - Parentheses removed (Weight: 1.2)
  - Prefix "万达影城" removed (Weight: 1.0)
  - Parentheses and inner contents removed (Weight: 0.6)
- Compute the score for each variant against all cinemas in `cinemaRecords` using LCS (Longest Common Subsequence) and consecutive matching characters.
- Pick the cinema with the highest score, checking if it meets the minimum matching threshold: `Math.max(30, maxVariantLength * 15)`.

#### 2. Movie Matcher
Compute a matching score for each movie in `this.movies` against the concatenated OCR words array:
- `score = charCoverage * 500 + wordCoverage * 300 + wordMatchesCount * 50`.
- Sort by score descending and select the highest-scoring candidate.
- Fall back to checking if the parsed movie name is included in or includes the film name.

#### 3. Showtime Matcher
- If there is no exact showtime match (e.g. 19:30 vs 19:35), calculate the absolute difference in minutes.
- Select the closest showtime if it is within a **30-minute threshold**.

---

### B. Cascading Polling & State Update
Because selections are loaded asynchronously, the store method `applyParsedOcrTicket` will wait for options to be populated:
- Implement a helper `waitForCondition(predicate: () => boolean, timeoutMs = 30000, intervalMs = 200)` using Promise-based `setTimeout`.
- Execute the matching chain sequentially:
  1. Match cinema -> Set `city` and `cinema` in query -> Call `this.loadCinemaShowtimes()` -> Wait for `this.movies.length > 0`.
  2. Match movie -> Set `movie` -> Call `this.selectMovie()` -> Wait for `this.dates.length > 0`.
  3. Match date -> Set `date` -> Call `this.selectDate()` -> Wait for `this.showtimes.length > 0`.
  4. Match showtime -> Set `showtime` -> Call `this.setShowtime()` -> Call `this.loadRealTimeSeats()` -> Wait for `this.seatNodes.length > 0`.
  5. Select seats by matching `id` (e.g., `row-col`) against parsed seat positions.

---

### C. Dropdown Click Callback Hook
To open select dropdowns programmatically without binding store to components:
- Register a callback function `clickDropdownCallback: (refName: string) => void` on the Pinia store.
- Component `TicketView.vue` registers this callback on mount.
- When calling `clickDropdownCallback(refName)`, check if the target component is open (`refObj.visible`) or if any select dropdown is open in the document (`document.querySelector('.el-select-dropdown:not(.is-hidden)')`). If true, call `click()` on `.el-select__wrapper` to open the dropdown wrapper.

---

## 3. Verification Plan
- Run Baidu OCR on a mock receipt.
- Verify that it automatically selects city, cinema, movie, date, showtime, and seats.
- Verify that if the cinema dropdown is currently clicked open, selecting a city programmatically transitions to opening the cinema/movie dropdown in sequence.
