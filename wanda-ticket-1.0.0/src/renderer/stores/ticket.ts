import { defineStore } from 'pinia'

export interface TicketOption {
  label: string
  value: string
}

export interface SelectedSeat {
  id: string
  rowName: string
  columnName: string
  areaName: string
}

export const useTicketStore = defineStore('ticket', {
  state: () => ({
    query: {
      keyword: '',
      city: '',
      cinema: '',
      movie: '',
      date: '',
      showtime: ''
    },
    cities: [] as TicketOption[],
    cinemas: [] as TicketOption[],
    movies: [] as TicketOption[],
    dates: [] as TicketOption[],
    showtimes: [] as TicketOption[],
    paymentActivity: '',
    selectedPaymentCards: [] as string[],
    selectedCoupons: [] as string[],
    selectedSeats: [] as SelectedSeat[],
    maxSeatCount: 8
  }),
  getters: {
    canSelectMovie(state) {
      return Boolean(state.query.cinema)
    },
    canSelectDate(state) {
      return Boolean(state.query.movie)
    },
    canSelectShowtime(state) {
      return Boolean(state.query.date)
    },
    canRefreshSeats(state) {
      return Boolean(state.query.city && state.query.cinema && state.query.movie && state.query.date && state.query.showtime)
    },
    selectedSeatCount(state) {
      return state.selectedSeats.length
    }
  },
  actions: {
    clearSeatSelection() {
      this.selectedSeats = []
    },
    resetQueryAfterCityChange() {
      this.query.cinema = ''
      this.query.movie = ''
      this.query.date = ''
      this.query.showtime = ''
      this.clearSeatSelection()
    },
    resetQueryAfterCinemaChange() {
      this.query.movie = ''
      this.query.date = ''
      this.query.showtime = ''
      this.clearSeatSelection()
    },
    resetQueryAfterMovieChange() {
      this.query.date = ''
      this.query.showtime = ''
      this.clearSeatSelection()
    },
    resetQueryAfterDateChange() {
      this.query.showtime = ''
      this.clearSeatSelection()
    }
  }
})
