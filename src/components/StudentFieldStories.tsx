import { ArrowRight } from 'lucide-react';
import { STUDENT_FIELD_CASES } from '../data/fieldCases';
import type { StudentTab } from './StudentDashboard';

interface StudentFieldStoriesProps {
  onNavigateTab?: (tab: StudentTab) => void;
  onSimulateCrisis?: () => void;
}

export function StudentFieldStories({
  onNavigateTab,
  onSimulateCrisis,
}: StudentFieldStoriesProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-teal-700">
            Rural Student Field Evidence · Problems Faced Daily
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
            Real transit challenges faced by village students
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Photographs from rural corridors illustrate why static timetables fail during morning
            rush hours, sudden bus breakdowns, monsoon road flooding, and examination deadlines.
          </p>
        </div>

        {onSimulateCrisis && (
          <button
            type="button"
            onClick={onSimulateCrisis}
            className="inline-flex items-center gap-2 self-start rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            Simulate Exam Day Crisis
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {STUDENT_FIELD_CASES.map((item) => (
          <article
            key={item.id}
            className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <div className="aspect-[16/10] w-full overflow-hidden bg-slate-100">
              <img
                src={item.imagePath}
                alt={item.imageAlt}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="flex flex-1 flex-col justify-between p-5">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-amber-700">{item.badge}</p>
                <h3 className="font-display text-lg font-bold leading-snug text-slate-900">
                  {item.title}
                </h3>

                <div className="rounded-lg border border-red-200 bg-red-50/70 p-3">
                  <p className="text-xs font-semibold text-red-900">Problem Faced by Students</p>
                  <p className="mt-1 text-xs leading-relaxed text-red-950">{item.problemFaced}</p>
                </div>

                <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3">
                  <p className="text-xs font-semibold text-teal-900">HALLI.MITRA Response</p>
                  <p className="mt-1 text-xs leading-relaxed text-teal-950">
                    {item.solutionSummary}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                <span className="text-xs font-medium text-slate-500">{item.affectedCorridor}</span>
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab(item.targetTab)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap"
                  >
                    {item.actionLabel}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
