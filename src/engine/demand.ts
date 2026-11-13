import type {
  CorridorGrowth,
  DemandForecastPoint,
  DemandPredictionResponse,
  HistoricalDemandRecord,
  HourlyDemandPoint,
} from '../types';

export function predictStudentDemand(params: {
  history: HistoricalDemandRecord[];
  corridorId: string;
  isExamPeriod?: boolean;
  isHoliday?: boolean;
  busCapacityBasis?: number;
}): DemandPredictionResponse {
  const {
    history,
    corridorId,
    isExamPeriod = false,
    isHoliday = false,
    busCapacityBasis = 50,
  } = params;

  const corridorRows = history.filter((r) => r.corridorId === corridorId);
  const corridorName =
    corridorRows[0]?.corridorName ?? 'Malavalli – Kirugavalu – PES Mandya';

  // Fit ordinary least squares trend on regular weekday observations
  const weekdayRows = corridorRows.filter((r) => !r.isWeekend && !r.isHoliday);
  const n = weekdayRows.length;
  let slope = 0.7;
  let intercept = 90;

  if (n > 1) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    weekdayRows.forEach((row, idx) => {
      const normalizedY = row.isExamPeriod ? row.actualStudents / 1.24 : row.actualStudents;
      sumX += idx;
      sumY += normalizedY;
      sumXY += idx * normalizedY;
      sumXX += idx * idx;
    });
    const denom = n * sumXX - sumX * sumX;
    if (denom !== 0) {
      slope = (n * sumXY - sumX * sumY) / denom;
      intercept = (sumY - slope * sumX) / n;
    }
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayMultipliers: Record<number, number> = {
    0: 0.18, // Sunday
    1: 1.09, // Monday peak
    2: 1.07, // Tuesday
    3: 1.0,
    4: 0.99,
    5: 0.95,
    6: 0.62, // Saturday half-day
  };

  const baseDate = new Date('2026-11-13T00:00:00Z');
  const weeklyForecast: DemandForecastPoint[] = [];

  for (let d = 0; d < 7; d++) {
    const dt = new Date(baseDate.getTime() + d * 86400000);
    const dow = dt.getUTCDay();
    const trendVal = intercept + slope * (n + d);
    let predicted = trendVal * (dayMultipliers[dow] ?? 1);

    if (isExamPeriod && dow !== 0) predicted *= 1.24;
    if (isHoliday) predicted *= 0.18;

    const rounded = Math.max(6, Math.round(predicted));
    const spread = Math.max(4, Math.round(rounded * 0.08));
    const recommendedBuses = Math.max(1, Math.ceil(rounded / busCapacityBasis));

    weeklyForecast.push({
      label: dayNames[dow],
      date: dt.toISOString().slice(0, 10),
      predictedStudents: rounded,
      lowerBound: Math.max(4, rounded - spread),
      upperBound: rounded + spread,
      recommendedBuses,
      isPeakDay: rounded >= busCapacityBasis * 2,
    });
  }

  const peakDaily = Math.max(...weeklyForecast.map((w) => w.predictedStudents));
  const hourlyWeights = [
    { hour: '06:30', share: 0.11 },
    { hour: '07:30', share: 0.34 },
    { hour: '08:30', share: 0.28 },
    { hour: '09:30', share: 0.09 },
    { hour: '13:00', share: 0.08 },
    { hour: '16:30', share: 0.32 },
    { hour: '17:30', share: 0.22 },
  ];

  const fleetCap = Math.max(1, Math.ceil(peakDaily / busCapacityBasis)) * busCapacityBasis;
  const hourlyProfile: HourlyDemandPoint[] = hourlyWeights.map((hw) => {
    const demand = Math.round(peakDaily * hw.share);
    return {
      hour: hw.hour,
      demand,
      capacity: Math.round(fleetCap * 0.32),
      isPeak: hw.share >= 0.25,
    };
  });

  // Compute growth across all corridors
  const corridorIds = Array.from(new Set(history.map((h) => h.corridorId)));
  const corridorGrowth: CorridorGrowth[] = corridorIds.map((cId) => {
    const rows = history.filter((h) => h.corridorId === cId && !h.isWeekend && !h.isHoliday);
    const half = Math.max(1, Math.floor(rows.length / 2));
    const firstHalfAvg =
      rows.slice(0, half).reduce((s, r) => s + r.actualStudents, 0) / half;
    const secondHalfAvg =
      rows.slice(half).reduce((s, r) => s + r.actualStudents, 0) /
      Math.max(1, rows.length - half);
    const growthPct =
      firstHalfAvg > 0
        ? Number((((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100).toFixed(1))
        : 0;
    const projectedNextWeekAvg = Math.round(
      secondHalfAvg * (isExamPeriod ? 1.24 : 1) * (isHoliday ? 0.18 : 1)
    );
    return {
      corridorId: cId,
      corridorName: rows[0]?.corridorName ?? cId,
      currentDailyAvg: Math.round(secondHalfAvg),
      projectedNextWeekAvg,
      growthPct,
      recommendedBuses: Math.max(1, Math.ceil(projectedNextWeekAvg / busCapacityBasis)),
    };
  });

  const maxBuses = Math.max(...weeklyForecast.map((w) => w.recommendedBuses));
  const modelSummary =
    `OLS Trend + Calendar Factor Model (n=${corridorRows.length} historical logs): ` +
    `Corridor slope +${slope.toFixed(2)} students/day. ` +
    (isExamPeriod
      ? 'Exam-week surge (+24%) active — '
      : isHoliday
      ? 'Academic holiday reduction (-82%) active — '
      : 'Standard semester schedule — ') +
    `peak windows at 07:30–08:30 AM and 04:30 PM require ${maxBuses} bus(es) (${busCapacityBasis}-seat basis).`;

  return {
    corridorId,
    corridorName,
    isExamPeriod,
    isHoliday,
    busCapacityBasis,
    weeklyForecast,
    hourlyProfile,
    corridorGrowth,
    modelSummary,
  };
}
