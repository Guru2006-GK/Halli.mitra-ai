import type { StudentFieldCase } from '../types';

export const STUDENT_FIELD_CASES: StudentFieldCase[] = [
  {
    id: 'case_overcrowded_boarding',
    imagePath: '/assets/aistudio/RURAL_1_90cd14b7.jpg',
    imageAlt:
      'Rural students with heavy backpacks crowding tightly at the front doorway of a red-and-white government bus',
    badge: 'Field Case 01 · Boarding Overcrowding',
    title: 'Dozens fighting to board a single morning government bus',
    problemFaced:
      'On high-attendance and examination mornings (+40% demand surge), only one government bus arrives across clustered villages. Students push at the narrow doorway, risk unsafe footboard travel, or get turned away when seats fill up.',
    solutionSummary:
      'Smart Bus Allocation enforces seated capacity caps, prioritizes high-demand villages first, and alerts administrators how many extra buses or backup feeder vans are required before boarding chaos begins.',
    affectedCorridor: 'Malavalli – Kirugavalu – PES Mandya',
    targetTab: 'tracker',
    actionLabel: 'Check Bus Seat Availability',
  },
  {
    id: 'case_stranded_breakdown',
    imagePath: '/assets/aistudio/RURAL_2_44f1d10c.jpg',
    imageAlt:
      'Large group of school and college students standing stranded behind an already packed rural government bus',
    badge: 'Field Case 02 · Bus Breakdown & Overflow',
    title: 'Exam-bound students left stranded when buses break down',
    problemFaced:
      'When two government buses go offline due to technical faults on an exam day, students standing outside have no fallback transport and risk missing examinations starting within the next two hours.',
    solutionSummary:
      'Alternative Transport & Smart Ride Sharing immediately match stranded commuters with verified cooperative vans, minibuses, and student carpools with upfront shared fares and live pickup ETAs.',
    affectedCorridor: 'Bannur – Srirangapatna – Mysuru & Kirugavalu',
    targetTab: 'alternatives',
    actionLabel: 'Find Verified Backup Vans',
  },
  {
    id: 'case_flood_walk',
    imagePath: '/assets/aistudio/RURAL_3_0bb8f810.jpg',
    imageAlt:
      'Five rural students in white school uniforms walking single-file down an overcast country road after losing bus access',
    badge: 'Field Case 03 · Flooded Road Walkout',
    title: 'Students forced to walk kilometers in wet weather after road closures',
    problemFaced:
      'When monsoon flooding blocks a major road connecting two villages, regular bus routes cut short or stall. Without detour visibility, students must walk long distances on foot under severe exam time pressure.',
    solutionSummary:
      'AI Route Optimizer computes an A* flood detour via open paved corridors and pushes instant Route Disruption alerts to every affected student dashboard.',
    affectedCorridor: 'Malavalli ↔ Kirugavalu Flood Detour',
    targetTab: 'optimizer',
    actionLabel: 'Open A* Flood Detour',
  },
];
