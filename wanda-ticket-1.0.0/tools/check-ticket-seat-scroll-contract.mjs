import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n')
}

function assertIncludes(file, source, text) {
  assert.ok(source.includes(text), `${file} should include ${text}`)
}

const packageJson = JSON.parse(read('package.json'))
const ticketView = read('src/renderer/views/TicketView.vue')
const seatMap = read('src/renderer/components/SeatMap.vue')

assert.equal(
  packageJson.scripts['check:ticket-seat-scroll'],
  'node tools/check-ticket-seat-scroll-contract.mjs',
  'package.json should expose check:ticket-seat-scroll'
)

for (const marker of [
  '.ticket-center {\n  overflow-x: hidden;\n  overflow-y: auto;',
  'scrollbar-gutter: stable;',
  '.seat-panel {\n  flex: 1 0 420px;\n  min-height: 420px;\n  overflow: hidden;',
  '.seat-stage {\n  flex: 1;\n  min-width: 0;\n  min-height: 0;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);',
  '.seat-scroll {\n  align-self: stretch;\n  justify-self: stretch;',
  'overflow: auto;',
  'scrollbar-gutter: stable both-edges;'
]) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, marker)
}

for (const marker of [
  "import { computed } from 'vue'",
  'const mapStyle = computed<Record<string, string>>(() => {',
  'const maxX = maxSeatCoordinate((seat) => seat.coordx)',
  'const maxY = maxSeatCoordinate((seat) => seat.coordy)',
  'width: `${Math.max(760, mapWidth)}px`,',
  'height: `${Math.max(360, mapHeight)}px`',
  '<div class="seat-map" :style="mapStyle">'
]) {
  assertIncludes('src/renderer/components/SeatMap.vue', seatMap, marker)
}

console.log('Ticket seat scroll contract passed')
