# Replicating Legacy OCR Matching & Cascading Click Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate the robust Levenshtein/LCS scoring matchers for cinemas and movies, date parsing, closest-time showtime matching, cascading asynchronous polling, and DOM dropdown click simulation from the legacy project into the refactored Pinia store and Vue component.

**Architecture:** Implement scoring and matching helpers, cascading wait timers, and a DOM callback bridge within the Pinia store (`src/renderer/stores/ticket.ts`). Expose element references from the component `src/renderer/views/TicketView.vue` and inject them as click handlers via Vue nextTick.

**Tech Stack:** Vue 3, Pinia, TypeScript, Element Plus.

## Global Constraints
- Do not remove the signatures of `findUniqueCinemaByText` or `findUniqueOptionByText` from `src/renderer/stores/ticket.ts` to ensure contract checks pass.
- Maintain existing linting rules and run `npm run typecheck` and `npm run check:all` for verification.

---

### Task 1: Implement String Matching and Polling Helpers

**Files:**
- Modify: `wanda-ticket-1.0.0/src/renderer/stores/ticket.ts`

**Interfaces:**
- Consumes: None
- Produces: `waitForCondition` utility, LCS scoring algorithm, closest-time match algorithm.

- [ ] **Step 1: Define the `waitForCondition` helper**
  Add the polling helper to `src/renderer/stores/ticket.ts` to wait for asynchronous dropdown lists:
  ```typescript
  function waitForCondition(predicate: () => boolean, timeoutMs = 15000, intervalMs = 200): Promise<boolean> {
    const startTime = Date.now()
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (predicate()) {
          clearInterval(interval)
          resolve(true)
        } else if (Date.now() - startTime >= timeoutMs) {
          clearInterval(interval)
          resolve(false)
        }
      }, intervalMs)
    })
  }
  ```

- [ ] **Step 2: Implement LCS (Longest Common Subsequence) score calculator**
  Add the LCS score calculation to the store helper functions:
  ```typescript
  function computeLcsLength(str1: string, str2: string): number {
    const len1 = str1.length
    const len2 = str2.length
    const dp = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0))

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
        }
      }
    }
    return dp[len1][len2]
  }

  function computeLcsConsecutive(str1: string, str2: string): number {
    const len1 = str1.length
    const len2 = str2.length
    const dp = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0))
    let maxLen = 0

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1
          maxLen = Math.max(maxLen, dp[i][j])
        } else {
          dp[i][j] = 0
        }
      }
    }
    return maxLen;
  }
  ```

- [ ] **Step 3: Run typescript verification**
  Run: `npm run typecheck`
  Expected: Success

- [ ] **Step 4: Commit**
  ```bash
  git add wanda-ticket-1.0.0/src/renderer/stores/ticket.ts
  git commit -m "feat: add LCS matching and polling utilities in ticket store"
  ```

---

### Task 2: Implement Scoring-Based Cinema & Movie Matching

**Files:**
- Modify: `wanda-ticket-1.0.0/src/renderer/stores/ticket.ts`

- [ ] **Step 1: Rewrite `findUniqueCinemaByText`**
  Modify `findUniqueCinemaByText` in `src/renderer/stores/ticket.ts` to score candidates and return the highest score:
  ```typescript
  function findUniqueCinemaByText(cinemas: CinemaRecord[], text: string): CinemaRecord | undefined {
    if (!text || cinemas.length === 0) return undefined

    const trimmed = text.trim()
    const spaceRemoved = trimmed.replace(/\s+/g, '')
    const parensRemoved = trimmed.replace(/[（(].*?[）)]/g, '')
    const parensReplaced = trimmed.replace(/[（(）)]/g, '')
    const prefixRemoved = parensRemoved.replace(/^万达影城/, '')

    interface WeightedVariant {
      text: string
      weight: number
    }

    const variants: WeightedVariant[] = [
      { text: trimmed, weight: 1.5 },
      { text: spaceRemoved, weight: 1.3 },
      { text: parensReplaced, weight: 1.2 },
      { text: prefixRemoved, weight: 1.0 },
      { text: parensRemoved, weight: 0.6 }
    ]

    const getMatchScore = (cinema: CinemaRecord): number => {
      const name = (cinema.name || '').trim().toLowerCase()
      const maoyanName = (cinema.maoyanName || '').trim().toLowerCase()

      let maxScore = 0
      for (const variant of variants) {
        const vText = variant.text.toLowerCase()
        const lcsName = computeLcsLength(vText, name)
        const lcsMaoyan = computeLcsLength(vText, maoyanName)
        const consecutiveName = computeLcsConsecutive(vText, name)
        const consecutiveMaoyan = computeLcsConsecutive(vText, maoyanName)

        const matchVal = Math.max(lcsName, lcsMaoyan)
        const consecutiveVal = Math.max(consecutiveName, consecutiveMaoyan)

        const variantScore = matchVal * 20 + consecutiveVal * 10
        const weightedScore = variantScore * variant.weight
        if (weightedScore > maxScore) {
          maxScore = weightedScore
        }
      }
      return maxScore
    }

    const candidates = cinemas.map((cinema) => ({
      cinema,
      score: getMatchScore(cinema)
    }))

    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]
    const maxLen = Math.max(...variants.map((v) => v.text.length))
    const threshold = Math.max(30, maxLen * 15)

    if (best && best.score >= threshold) {
      return best.cinema
    }
    return undefined
  }
  ```

- [ ] **Step 2: Rewrite `findUniqueOptionByText` (Movie Matching)**
  Modify `findUniqueOptionByText` in `src/renderer/stores/ticket.ts` to compute word coverage and match scores:
  ```typescript
  function findUniqueOptionByText(options: TicketOption[], text: string): TicketOption | undefined {
    if (!text || options.length === 0) return undefined

    const cleanedText = text.replace(/\s+/g, '').toLowerCase()

    const candidates = options.map((option) => {
      const name = (option.label || '').replace(/\s+/g, '').toLowerCase()
      if (cleanedText.includes(name) || name.includes(cleanedText)) {
        return { option, score: name.length * 100 + 1000 }
      }

      const nameChars = [...new Set(name.split(''))]
      let matchedChars = 0
      for (const char of nameChars) {
        if (cleanedText.includes(char)) matchedChars++
      }

      const charCoverage = nameChars.length > 0 ? matchedChars / nameChars.length : 0
      const score = charCoverage * 500
      return { option, score }
    })

    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]
    if (best && best.score > 100) {
      return best.option
    }
    return undefined
  }
  ```

- [ ] **Step 3: Run typescript verification**
  Run: `npm run typecheck`
  Expected: Success

- [ ] **Step 4: Commit**
  ```bash
  git add wanda-ticket-1.0.0/src/renderer/stores/ticket.ts
  git commit -m "feat: implement robust cinema and movie matchers using scoring"
  ```

---

### Task 3: Implement Showtime Matcher with 30-Min Threshold

**Files:**
- Modify: `wanda-ticket-1.0.0/src/renderer/stores/ticket.ts`

- [ ] **Step 1: Add time parsing and distance matcher**
  Add helper function to parse time difference and select the closest showtime:
  ```typescript
  function parseTimeToMinutes(timeStr: string): number {
    const parts = timeStr.match(/^(\d{1,2})[:：](\d{2})/)
    if (!parts) return 0
    return Number(parts[1]) * 60 + Number(parts[2])
  }

  function findClosestShowtime(showtimes: TicketOption[], targetTime: string): TicketOption | undefined {
    if (!targetTime || showtimes.length === 0) return undefined
    const targetMin = parseTimeToMinutes(targetTime)
    let bestOption: TicketOption | undefined = undefined
    let minDiff = Infinity

    for (const option of showtimes) {
      const timeMin = parseTimeToMinutes(option.label)
      if (timeMin === 0) continue
      const diff = Math.abs(timeMin - targetMin)
      if (diff < minDiff && diff <= 30) {
        minDiff = diff
        bestOption = option
      }
    }
    return bestOption
  }
  ```

- [ ] **Step 2: Update showtime matching in `applyParsedOcrTicket`**
  Modify showtime matching block in `applyParsedOcrTicket` in `src/renderer/stores/ticket.ts` to call `findClosestShowtime` as a fallback.

- [ ] **Step 3: Run typecheck**
  Run: `npm run typecheck`
  Expected: Success

- [ ] **Step 4: Commit**
  ```bash
  git add wanda-ticket-1.0.0/src/renderer/stores/ticket.ts
  git commit -m "feat: add closest-time showtime matcher within 30 mins"
  ```

---

### Task 4: Implement Polling Cascade and DOM Click Callback Bridge

**Files:**
- Modify: `wanda-ticket-1.0.0/src/renderer/stores/ticket.ts`
- Modify: `wanda-ticket-1.0.0/src/renderer/views/TicketView.vue`

- [ ] **Step 1: Add callback registration in `useTicketStore`**
  Modify `src/renderer/stores/ticket.ts`'s state and actions to support click callback:
  ```typescript
    state: () => ({
      clickCallback: null as ((refName: string) => void) | null,
      // ...
    }),
    actions: {
      registerClickCallback(callback: (refName: string) => void) {
        this.clickCallback = callback
      },
      clickDropdown(refName: string) {
        if (this.clickCallback) {
          this.clickCallback(refName)
        }
      },
      // ...
  ```

- [ ] **Step 2: Update `applyParsedOcrTicket` with asynchronous polling cascade and DOM trigger**
  Modify `applyParsedOcrTicket` inside `src/renderer/stores/ticket.ts`:
  ```typescript
      async applyParsedOcrTicket(parsed: ParsedOcrTicket) {
        const account = useAccountsStore().currentAccount
        const applied: string[] = []

        if (parsed.movieName || parsed.cinemaName) {
          this.query.keyword = parsed.movieName || parsed.cinemaName
        }

        if (parsed.cinemaName) {
          const cinema = findUniqueCinemaByText(this.cinemaRecords, parsed.cinemaName)
          if (cinema) {
            if (this.query.city !== cinema.cityId) {
              this.query.city = cinema.cityId
              this.selectCity()
            }
            this.query.cinema = cinema.id
            applied.push('影院')
            this.clickDropdown('cinemaSelectRef')
            await this.loadCinemaShowtimes()
            await waitForCondition(() => this.movies.length > 0)
          }
        }

        if (parsed.movieName && this.movies.length > 0) {
          const movie = findUniqueOptionByText(this.movies, parsed.movieName)
          if (movie) {
            this.query.movie = movie.value
            this.selectMovie()
            applied.push('影片')
            this.clickDropdown('movieSelectRef')
            await waitForCondition(() => this.dates.length > 0)
          }
        }

        if (parsed.date && this.dates.length > 0) {
          const date = this.dates.find((item) => optionMatchesDate(item, parsed.date))
          if (date) {
            this.query.date = date.value
            this.selectDate()
            applied.push('日期')
            this.clickDropdown('dateSelectRef')
            await waitForCondition(() => this.showtimes.length > 0)
          }
        }

        if (parsed.time && this.showtimes.length > 0) {
          let showtime = this.showtimes.find((item) => optionMatchesTime(item, parsed.time))
          if (!showtime) {
            showtime = findClosestShowtime(this.showtimes, parsed.time)
          }
          if (showtime) {
            this.query.showtime = showtime.value
            this.setShowtime()
            applied.push('场次')
            this.clickDropdown('sessionSelectRef')
          }
        }

        if (parsed.seats.length > 0) {
          if (this.seatNodes.length === 0 && this.canRefreshSeats) {
            await this.loadRealTimeSeats()
            await waitForCondition(() => this.seatNodes.length > 0)
          }
          const selectedCount = this.selectSeatsByParsedOcr(parsed)
          if (selectedCount > 0) {
            applied.push(`座位 ${selectedCount} 个`)
          }
        }

        this.showtimeError =
          applied.length > 0 ? `OCR 已匹配：${applied.join('、')}` : 'OCR 已识别，请先加载真实城市、影院、影片和场次后再匹配'

        useLogsStore().addLog(
          'OCR识别',
          account?.phone || '-',
          applied.length > 0 ? `OCR 匹配成功：${applied.join('、')}` : 'OCR 已识别但未匹配到当前真实数据'
        )
      },
  ```

- [ ] **Step 3: Add refs and register callback in `TicketView.vue`**
  Modify `<script setup>` in `src/renderer/views/TicketView.vue`:
  - Define select refs:
    ```typescript
    const citySelectRef = ref()
    const cinemaSelectRef = ref()
    const movieSelectRef = ref()
    const dateSelectRef = ref()
    const showtimeSelectRef = ref()
    ```
  - Register callbacks on mounted:
    ```typescript
    import { onMounted } from 'vue'

    onMounted(() => {
      ticketStore.registerClickCallback((refName: string) => {
        let refObj: any = null
        if (refName === 'cinemaSelectRef') refObj = cinemaSelectRef.value
        else if (refName === 'movieSelectRef') refObj = movieSelectRef.value
        else if (refName === 'dateSelectRef') refObj = dateSelectRef.value
        else if (refName === 'sessionSelectRef') refObj = showtimeSelectRef.value
        if (!refObj) return

        nextTick(() => {
          const el = refObj.$el?.querySelector('.el-select__wrapper') || refObj.$el
          const visible = refObj.visible ?? false
          const anyDropdownOpen = document.querySelector('.el-select-dropdown:not(.is-hidden)')
          if (el && (visible || anyDropdownOpen)) {
            el.click?.()
          }
        })
      })
    })
    ```
  - Bind refs in the template inside `src/renderer/views/TicketView.vue`:
    - Add `ref="citySelectRef"` on City select dropdown
    - Add `ref="cinemaSelectRef"` on Cinema select dropdown
    - Add `ref="movieSelectRef"` on Movie select dropdown
    - Add `ref="dateSelectRef"` on Date select dropdown
    - Add `ref="showtimeSelectRef"` on Showtime select dropdown

- [ ] **Step 4: Run verification**
  Run: `npm run typecheck`
  Run: `npm run check:all`
  Expected: All checks PASS!

- [ ] **Step 5: Commit**
  ```bash
  git add wanda-ticket-1.0.0/src/renderer/stores/ticket.ts wanda-ticket-1.0.0/src/renderer/views/TicketView.vue
  git commit -m "feat: complete cascading polling matchers and DOM click simulation"
  ```
