// Type definitions for VIC Duty Roster

export interface Faculty {
  id: string;
  name: string;
  department: string;
  designation: string;
  fid: string;
  dutyCount: number;
  shortName?: string;
  unavailable?: string;
  gender?: 'Male' | 'Female';
}

export interface DutyHistory {
  id: string;
  facultyId: string;
  date: string;
  shift: number;
  role: 'supervisor' | 'invigilator';
  roomNo?: string;
}

export interface InvigilatorSlot {
  id: string;
  facultyName: string | null;
  order: number;
}

export interface Room {
  id: number;
  roomNo: string;
  students: string;
  invigilators: string;
  slots: InvigilatorSlot[];
}

export interface DutyAssignment {
  id: string;
  date: string;
  course: string;
  semester: string;
  year: string;
  curriculum: string;
  shiftMode: 'both' | 'forenoon' | 'afternoon';
  shift1?: ShiftData;
  shift2?: ShiftData;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftData {
  time: string;
  supervisor: string;
  rooms: Room[];
}

export type DragItem = {
  type: 'faculty';
  facultyName: string;
  sourceShift?: number;
  sourceRoomId?: number;
  sourceSlotId?: string;
};
