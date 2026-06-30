/** 日期工具函数 */

/** 返回相对时间描述，如 "今天截止"、"明天"、"3天后"、"已逾期 2 天" */
export function formatRelativeDate(dueAt: number): string {
  const now = new Date();
  const due = new Date(dueAt);

  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffMs = dueDate.getTime() - nowDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `已逾期 ${Math.abs(diffDays)} 天`;
  }
  if (diffDays === 0) {
    return "今天截止";
  }
  if (diffDays === 1) {
    return "明天";
  }
  if (diffDays <= 7) {
    return `${diffDays} 天后`;
  }
  return `${due.getMonth() + 1}/${due.getDate()}`;
}

/** 是否逾期 */
export function isOverdue(dueAt: number): boolean {
  const now = new Date();
  const due = new Date(dueAt);
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return dueDate.getTime() < nowDate.getTime();
}

/** 是否今天截止 */
export function isDueToday(dueAt: number): boolean {
  const now = new Date();
  const due = new Date(dueAt);
  return now.toDateString() === due.toDateString();
}

/** 快捷日期语法解析：支持 #今天 #明天 #后天 #下周 #下周一 */
export function parseQuickDateShortcuts(input: string): {
  text: string;
  dueAt: number | undefined;
} {
  const trimmed = input.trim();

  // Match patterns like #明天, #后天, #下周, #今天 at end of string or standalone
  const patterns: { regex: RegExp; getDate: () => Date }[] = [
    {
      regex: /#今天(?:\s|$)/,
      getDate: () => {
        const d = new Date();
        d.setHours(23, 59, 59, 999);
        return d;
      },
    },
    {
      regex: /#明天(?:\s|$)/,
      getDate: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(23, 59, 59, 999);
        return d;
      },
    },
    {
      regex: /#后天(?:\s|$)/,
      getDate: () => {
        const d = new Date();
        d.setDate(d.getDate() + 2);
        d.setHours(23, 59, 59, 999);
        return d;
      },
    },
    {
      regex: /#下周(?:\s|$)/,
      getDate: () => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        d.setHours(23, 59, 59, 999);
        return d;
      },
    },
  ];

  let text = trimmed;
  let dueAt: number | undefined;

  for (const { regex, getDate } of patterns) {
    if (regex.test(text)) {
      text = text.replace(regex, " ").trim();
      dueAt = getDate().getTime();
      break;
    }
  }

  // Parse "#下周一" style
  const weekdayMatch = text.match(/#下周([一二三四五六日])(?:\s|$)/);
  if (weekdayMatch) {
    const weekdayMap: Record<string, number> = {
      一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0,
    };
    const targetDay = weekdayMap[weekdayMatch[1]];
    if (targetDay !== undefined) {
      const d = new Date();
      const currentDay = d.getDay();
      const daysUntilNextWeek = 7 - currentDay + targetDay;
      d.setDate(d.getDate() + (daysUntilNextWeek <= 7 ? daysUntilNextWeek : daysUntilNextWeek - 7));
      d.setHours(23, 59, 59, 999);
      dueAt = d.getTime();
      text = text.replace(weekdayMatch[0], " ").trim();
    }
  }

  return { text, dueAt };
}

/** Format date for native input[type=date] value */
export function toDateInputValue(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

/** Parse date from input[type=date] to timestamp (end of day) */
export function fromDateInputValue(value: string): number {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
