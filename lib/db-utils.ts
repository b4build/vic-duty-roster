// Database utilities using localStorage (works client-side)
// For Vercel deployment, this can be upgraded to Vercel Postgres

import { DutyAssignment, DutyHistory, Faculty } from './types';

const STORAGE_KEYS = {
  DUTIES: 'vic_duty_assignments',
  HISTORY: 'vic_duty_history',
  FACULTY: 'vic_faculty_data'
};

// Duty Assignments
export const saveDutyAssignment = (assignment: DutyAssignment): void => {
  const existing = getAllDutyAssignments();
  const index = existing.findIndex(d => d.date === assignment.date);
  
  if (index >= 0) {
    existing[index] = assignment;
  } else {
    existing.push(assignment);
  }
  
  localStorage.setItem(STORAGE_KEYS.DUTIES, JSON.stringify(existing));
};

export const getDutyAssignmentByDate = (date: string): DutyAssignment | null => {
  const all = getAllDutyAssignments();
  return all.find(d => d.date === date) || null;
};

export const getAllDutyAssignments = (): DutyAssignment[] => {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.DUTIES);
  return data ? JSON.parse(data) : [];
};

export const deleteDutyAssignment = (date: string): void => {
  const all = getAllDutyAssignments();
  const filtered = all.filter(d => d.date !== date);
  localStorage.setItem(STORAGE_KEYS.DUTIES, JSON.stringify(filtered));
};

export const clearAllDutyAssignments = (): void => {
  localStorage.setItem(STORAGE_KEYS.DUTIES, JSON.stringify([]));
};

// Duty History
export const addDutyHistory = (history: DutyHistory): void => {
  const all = getAllDutyHistory();
  all.push(history);
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(all));
};

export const getDutyHistoryByFaculty = (facultyId: string): DutyHistory[] => {
  const all = getAllDutyHistory();
  return all.filter(h => h.facultyId === facultyId);
};

export const getAllDutyHistory = (): DutyHistory[] => {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
  return data ? JSON.parse(data) : [];
};

export const getDutyHistoryByDate = (date: string): DutyHistory[] => {
  const all = getAllDutyHistory();
  return all.filter(h => h.date === date);
};

// Faculty Data Management
export const updateFacultyDutyCount = (facultyId: string, increment: number): void => {
  const faculty = getAllFaculty();
  const updated = faculty.map(f => 
    f.id === facultyId 
      ? { ...f, dutyCount: (f.dutyCount || 0) + increment }
      : f
  );
  localStorage.setItem(STORAGE_KEYS.FACULTY, JSON.stringify(updated));
};

export const updateFacultyRecord = (
  facultyId: string,
  updates: Partial<Omit<Faculty, 'id'>>
): Faculty | null => {
  const faculty = getAllFaculty();
  let updatedRecord: Faculty | null = null;
  const updated = faculty.map(f => {
    if (f.id !== facultyId) return f;
    updatedRecord = { ...f, ...updates };
    return updatedRecord;
  });
  if (!updatedRecord) return null;
  localStorage.setItem(STORAGE_KEYS.FACULTY, JSON.stringify(updated));
  return updatedRecord;
};

export const getAllFaculty = (): Faculty[] => {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.FACULTY);
  if (data) {
    return JSON.parse(data);
  }
  // Initialize from static data on first load
  return [];
};

export const initializeFacultyData = (initialData: Faculty[]): void => {
  const existing = localStorage.getItem(STORAGE_KEYS.FACULTY);
  if (!existing) {
    localStorage.setItem(STORAGE_KEYS.FACULTY, JSON.stringify(initialData));
    return;
  }
  try {
    const parsed = JSON.parse(existing);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(STORAGE_KEYS.FACULTY, JSON.stringify(initialData));
    }
  } catch {
    localStorage.setItem(STORAGE_KEYS.FACULTY, JSON.stringify(initialData));
  }
};

export const replaceFacultyData = (faculty: Faculty[]): void => {
  localStorage.setItem(STORAGE_KEYS.FACULTY, JSON.stringify(faculty));
};

export const syncFacultyMetadataFromSeed = (seedData: Faculty[]): boolean => {
  if (typeof window === 'undefined') return false;
  const existing = getAllFaculty();
  if (!Array.isArray(existing) || existing.length === 0) return false;

  const byId = new Map(seedData.map(f => [f.id, f]));
  const byName = new Map(seedData.map(f => [f.name.toLowerCase(), f]));
  let changed = false;

  const merged = existing.map(f => {
    const seed = byId.get(f.id) || byName.get(f.name.toLowerCase());
    if (!seed) return f;

    const next = { ...f };
    if (!next.gender && seed.gender) {
      next.gender = seed.gender;
      changed = true;
    }
    if (!next.facultyShift && seed.facultyShift) {
      next.facultyShift = seed.facultyShift;
      changed = true;
    }
    return next;
  });

  if (changed) {
    localStorage.setItem(STORAGE_KEYS.FACULTY, JSON.stringify(merged));
  }
  return changed;
};

// Generate duty history from assignment
export const generateDutyHistoryFromAssignment = (assignment: DutyAssignment): DutyHistory[] => {
  const history: DutyHistory[] = [];
  const baseDate = assignment.date;

  // Process Shift 1
  if (assignment.shift1 && assignment.shiftMode !== 'afternoon') {
    // Supervisor
    if (assignment.shift1.supervisor) {
      const faculty = getAllFaculty().find(f => f.name === assignment.shift1!.supervisor);
      if (faculty) {
        history.push({
          id: `${baseDate}-shift1-super-${faculty.id}`,
          facultyId: faculty.id,
          date: baseDate,
          shift: 1,
          role: 'supervisor',
        });
      }
    }

    // Invigilators
    assignment.shift1.rooms.forEach(room => {
      room.slots.forEach(slot => {
        if (slot.facultyName) {
          const faculty = getAllFaculty().find(f => f.name === slot.facultyName);
          if (faculty) {
            history.push({
              id: `${baseDate}-shift1-${room.id}-${slot.id}`,
              facultyId: faculty.id,
              date: baseDate,
              shift: 1,
              role: 'invigilator',
              roomNo: room.roomNo,
            });
          }
        }
      });
    });
  }

  // Process Shift 2
  if (assignment.shift2 && assignment.shiftMode !== 'forenoon') {
    // Supervisor
    if (assignment.shift2.supervisor) {
      const faculty = getAllFaculty().find(f => f.name === assignment.shift2!.supervisor);
      if (faculty) {
        history.push({
          id: `${baseDate}-shift2-super-${faculty.id}`,
          facultyId: faculty.id,
          date: baseDate,
          shift: 2,
          role: 'supervisor',
        });
      }
    }

    // Invigilators
    assignment.shift2.rooms.forEach(room => {
      room.slots.forEach(slot => {
        if (slot.facultyName) {
          const faculty = getAllFaculty().find(f => f.name === slot.facultyName);
          if (faculty) {
            history.push({
              id: `${baseDate}-shift2-${room.id}-${slot.id}`,
              facultyId: faculty.id,
              date: baseDate,
              shift: 2,
              role: 'invigilator',
              roomNo: room.roomNo,
            });
          }
        }
      });
    });
  }

  return history;
};

// Update duty counts when saving
export const updateDutyCounts = (assignment: DutyAssignment): void => {
  const history = generateDutyHistoryFromAssignment(assignment);

  // Clear old history for this date
  const allHistory = getAllDutyHistory().filter(h => h.date !== assignment.date);
  const mergedHistory = [...allHistory, ...history];
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(mergedHistory));

  // Recalculate duty counts for all faculty
  const faculty = getAllFaculty();
  const countsByFacultyId = new Map<string, number>();
  mergedHistory.forEach(entry => {
    countsByFacultyId.set(entry.facultyId, (countsByFacultyId.get(entry.facultyId) || 0) + 1);
  });

  const updatedFaculty = faculty.map(f => {
    return { ...f, dutyCount: countsByFacultyId.get(f.id) || 0 };
  });

  localStorage.setItem(STORAGE_KEYS.FACULTY, JSON.stringify(updatedFaculty));
};

export const resetDutyCountsForDate = (date: string): void => {
  const remainingHistory = getAllDutyHistory().filter(h => h.date !== date);
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(remainingHistory));

  const faculty = getAllFaculty();
  const updatedFaculty = faculty.map(f => {
    const count = remainingHistory.filter(h => h.facultyId === f.id).length;
    return { ...f, dutyCount: count };
  });
  localStorage.setItem(STORAGE_KEYS.FACULTY, JSON.stringify(updatedFaculty));
};

export const resetAllDutyCounts = (): void => {
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify([]));
  const faculty = getAllFaculty();
  const updatedFaculty = faculty.map(f => ({ ...f, dutyCount: 0 }));
  localStorage.setItem(STORAGE_KEYS.FACULTY, JSON.stringify(updatedFaculty));
};

export const exportBackupData = () => {
  return {
    duties: getAllDutyAssignments(),
    history: getAllDutyHistory(),
    faculty: getAllFaculty()
  };
};

export const importBackupData = (data: {
  duties?: DutyAssignment[];
  history?: DutyHistory[];
  faculty?: Faculty[];
}): void => {
  const duties = Array.isArray(data.duties) ? data.duties : [];
  const history = Array.isArray(data.history) ? data.history : [];
  const faculty = Array.isArray(data.faculty) ? data.faculty : [];

  // Persist base sections first so derivation helpers can resolve faculty names.
  localStorage.setItem(STORAGE_KEYS.DUTIES, JSON.stringify(duties));
  localStorage.setItem(STORAGE_KEYS.FACULTY, JSON.stringify(faculty));

  // Prefer rebuilding history from duties to avoid importing stale/incomplete history.
  const effectiveHistory = duties.length > 0
    ? duties.flatMap(assignment => generateDutyHistoryFromAssignment(assignment))
    : history;

  const countsByFacultyId = new Map<string, number>();
  effectiveHistory.forEach(entry => {
    countsByFacultyId.set(entry.facultyId, (countsByFacultyId.get(entry.facultyId) || 0) + 1);
  });

  const normalizedFaculty = faculty.map(f => ({
    ...f,
    dutyCount: countsByFacultyId.get(f.id) || 0
  }));

  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(effectiveHistory));
  localStorage.setItem(STORAGE_KEYS.FACULTY, JSON.stringify(normalizedFaculty));
};
