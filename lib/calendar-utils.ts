export interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

export function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function getDayStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function buildCalendarDays(
  year: number,
  month: number,
  selectedTs?: number
): CalendarDay[] {
  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = firstDayOfMonth.getDay();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const selectedDate = selectedTs ? new Date(selectedTs) : null;
  const selectedStr = selectedDate
    ? `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`
    : null;

  const days: CalendarDay[] = [];

  // Previous month filler
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    const dStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    days.push({
      date: d,
      dayOfMonth: d.getDate(),
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      isSelected: dStr === selectedStr,
    });
  }

  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const dStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    days.push({
      date: d,
      dayOfMonth: i,
      isCurrentMonth: true,
      isToday: dStr === todayStr,
      isSelected: dStr === selectedStr,
    });
  }

  // Next month filler to make 6 rows (42 cells)
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    const dStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    days.push({
      date: d,
      dayOfMonth: d.getDate(),
      isCurrentMonth: false,
      isToday: dStr === todayStr,
      isSelected: dStr === selectedStr,
    });
  }

  return days;
}

export function buildWeekDays(anchorDate: Date): CalendarDay[] {
  const startOfWeek = new Date(anchorDate);
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - day);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  const days: CalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const dStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    days.push({
      date: d,
      dayOfMonth: d.getDate(),
      isCurrentMonth: true,
      isToday: dStr === todayStr,
      isSelected: false,
    });
  }
  return days;
}

export function getMonthYearLabel(year: number, month: number): string {
  return `${year}年${month + 1}月`;
}

export function getWeekLabel(startDate: Date, endDate: Date): string {
  const s = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
  const e = `${endDate.getMonth() + 1}/${endDate.getDate()}`;
  return `${s} – ${e}`;
}
