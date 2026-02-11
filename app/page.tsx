"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Users, Printer, Trash2, Plus, Search, Filter, X, ChevronDown, Clock, Building2, UserCircle2, AlertCircle, ClipboardList, DoorOpen, UserCheck, GripVertical, History, LayoutDashboard, TrendingUp } from 'lucide-react';
import facultyData from '@/lib/faculty-data.json';
import { Faculty, Room, InvigilatorSlot, DragItem, DutyAssignment, ShiftData } from '@/lib/types';
import { saveDutyAssignment, getDutyAssignmentByDate, updateDutyCounts, initializeFacultyData, getAllFaculty, getDutyHistoryByFaculty, getAllDutyAssignments, getAllDutyHistory, resetDutyCountsForDate, resetAllDutyCounts, exportBackupData, importBackupData, deleteDutyAssignment, clearAllDutyAssignments, replaceFacultyData, updateFacultyRecord } from '@/lib/db-utils';

type ViewMode = 'roster' | 'directory' | 'dashboard';
type FacultySortBy = 'name' | 'department' | 'designation' | 'dutyCount' | 'fid';
type SortOrder = 'asc' | 'desc';

export default function DutyRoster() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('roster');
  
  // Faculty Directory states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [isEditingFaculty, setIsEditingFaculty] = useState(false);
  const [facultyEdit, setFacultyEdit] = useState({
    designation: '',
    department: '',
    fid: '',
    shortName: '',
    unavailable: '',
    gender: '' as '' | 'Male' | 'Female'
  });
  const [directorySortBy, setDirectorySortBy] = useState<FacultySortBy>('name');
  const [directorySortOrder, setDirectorySortOrder] = useState<SortOrder>('asc');
  
  // Roster states
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableFaculty, setAvailableFaculty] = useState<Faculty[]>([]);
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [allowRepeatDuty, setAllowRepeatDuty] = useState(false);
  const [exportAllDates, setExportAllDates] = useState(true);
  const [exportFrom, setExportFrom] = useState(new Date().toISOString().split('T')[0]);
  const [exportTo, setExportTo] = useState(new Date().toISOString().split('T')[0]);
  const [dataVersion, setDataVersion] = useState(0);
  const [theme, setTheme] = useState('light');
  const [availableSortBy, setAvailableSortBy] = useState<FacultySortBy>('name');
  const [availableSortOrder, setAvailableSortOrder] = useState<SortOrder>('asc');
  const [isCompactScreen, setIsCompactScreen] = useState(false);
  const allFaculty = useMemo(() => getAllFaculty(), [dataVersion]);
  const printRef = useRef<HTMLDivElement | null>(null);
  
  // Form fields
  const [course, setCourse] = useState('B.A. / B.Sc. / B.Com.');
  const [semester, setSemester] = useState('SEM V');
  const [year, setYear] = useState('2025');
  const [curriculum, setCurriculum] = useState('Under CCF');
  const [shiftMode, setShiftMode] = useState<'both' | 'forenoon' | 'afternoon'>('both');
  
  // Shift 1
  const [time1, setTime1] = useState('Morning (10 AM Onwards)');
  const [super1, setSuper1] = useState('');
  const [rooms1, setRooms1] = useState<Room[]>([
    { id: 1, roomNo: '02', students: '24', invigilators: '2', slots: [] },
    { id: 2, roomNo: '06', students: '30', invigilators: '2', slots: [] }
  ]);
  
  // Shift 2
  const [time2, setTime2] = useState('Afternoon (2 PM Onwards)');
  const [super2, setSuper2] = useState('');
  const [rooms2, setRooms2] = useState<Room[]>([
    { id: 3, roomNo: '18', students: '23', invigilators: '2', slots: [] }
  ]);

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);

  // Initialize faculty data and load saved assignment
  useEffect(() => {
    initializeFacultyData(facultyData as Faculty[]);
    const filtered = getAvailableFacultyByDate(selectedDate, getAllFaculty());
    setAvailableFaculty(filtered);
    
    // Load saved duty for this date
    loadDutyAssignment(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('vic_theme') : null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vic_theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 1023px), (pointer: coarse)');
    const apply = () => setIsCompactScreen(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  const normalizeRooms = (rooms: Room[]) => {
    let changed = false;
    const normalized = rooms.map(room => {
      const count = Number.isNaN(parseInt(room.invigilators || '0'))
        ? 0
        : parseInt(room.invigilators || '0');
      if (room.slots.length !== count) {
        changed = true;
        return {
          ...room,
          slots: createSlots(count, room.slots)
        };
      }
      return room;
    });
    return { normalized, changed };
  };

  // Ensure slots are present for rooms after loading or edits
  useEffect(() => {
    const { normalized, changed } = normalizeRooms(rooms1);
    if (changed) setRooms1(normalized);
  }, [rooms1]);

  useEffect(() => {
    const { normalized, changed } = normalizeRooms(rooms2);
    if (changed) setRooms2(normalized);
  }, [rooms2]);

  const loadDutyAssignment = (date: string) => {
    const saved = getDutyAssignmentByDate(date);
    if (saved) {
      setCourse(saved.course);
      setSemester(saved.semester);
      setYear(saved.year);
      setCurriculum(saved.curriculum);
      setShiftMode(saved.shiftMode);
      
      if (saved.shift1) {
        setTime1(saved.shift1.time);
        setSuper1(saved.shift1.supervisor);
        setRooms1(saved.shift1.rooms);
      }
      
      if (saved.shift2) {
        setTime2(saved.shift2.time);
        setSuper2(saved.shift2.supervisor);
        setRooms2(saved.shift2.rooms);
      }
    } else {
      // Reset to defaults
      setSuper1('');
      setSuper2('');
      setRooms1([
        { id: Date.now(), roomNo: '02', students: '24', invigilators: '2', slots: createSlots(2, []) },
        { id: Date.now() + 1, roomNo: '06', students: '30', invigilators: '2', slots: createSlots(2, []) }
      ]);
      setRooms2([
        { id: Date.now() + 2, roomNo: '18', students: '23', invigilators: '2', slots: createSlots(2, []) }
      ]);
    }
  };

  const createSlots = (count: number, existingSlots: InvigilatorSlot[]): InvigilatorSlot[] => {
    const slots: InvigilatorSlot[] = [];
    for (let i = 0; i < count; i++) {
      slots.push(existingSlots[i] || {
        id: `slot-${Date.now()}-${i}`,
        facultyName: null,
        order: i
      });
    }
    return slots;
  };

  const getAvailableFacultyByDate = (dateValue: string, source: Faculty[]) => {
    const date = new Date(dateValue);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    return source.filter(f => {
      const fid = (f.fid || '').toLowerCase();
      if (!fid) return true;
      const fidDays = fid.split(',').map(d => d.trim()).filter(Boolean);
      const isFidDay = fidDays.some(day => dayName.includes(day) || day.includes(dayName));
      return !isFidDay;
    });
  };

  const departments = ['all', ...Array.from(new Set(facultyData.map(f => f.department)))];

  const filteredFaculty = allFaculty.filter(faculty => {
    const matchesSearch = faculty.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         faculty.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         faculty.designation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = selectedDepartment === 'all' || faculty.department === selectedDepartment;
    return matchesSearch && matchesDepartment;
  });

  const sortFacultyList = (
    list: Faculty[],
    sortBy: FacultySortBy,
    sortOrder: SortOrder
  ): Faculty[] => {
    const direction = sortOrder === 'asc' ? 1 : -1;
    const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
    const byNumber = (a: number, b: number) => a - b;

    return [...list].sort((a, b) => {
      let result = 0;
      if (sortBy === 'name') result = byText(a.name, b.name);
      if (sortBy === 'department') result = byText(a.department || '', b.department || '');
      if (sortBy === 'designation') result = byText(a.designation || '', b.designation || '');
      if (sortBy === 'fid') result = byText(a.fid || '', b.fid || '');
      if (sortBy === 'dutyCount') result = byNumber(a.dutyCount || 0, b.dutyCount || 0);
      if (result === 0) result = byText(a.name, b.name);
      return result * direction;
    });
  };

  const sortedDirectoryFaculty = sortFacultyList(filteredFaculty, directorySortBy, directorySortOrder);

  // Get all assigned faculty names
  const getAllAssignedFaculty = (shift: 1 | 2): Set<string> => {
    const rooms = shift === 1 ? rooms1 : rooms2;
    const supervisor = shift === 1 ? super1 : super2;
    const assigned = new Set<string>();
    
    if (supervisor) assigned.add(supervisor);
    rooms.forEach(room => {
      room.slots.forEach(slot => {
        if (slot.facultyName) assigned.add(slot.facultyName);
      });
    });
    
    return assigned;
  };

  const takenByShift1 = getAllAssignedFaculty(1);
  const takenByShift2 = getAllAssignedFaculty(2);
  
  const assignedToday = new Set<string>([...takenByShift1, ...takenByShift2]);
  const dutyCountById = new Map(allFaculty.map(f => [f.id, f.dutyCount || 0]));
  const availableFacultyWithCounts = availableFaculty.map(f => ({
    ...f,
    dutyCount: dutyCountById.get(f.id) ?? f.dutyCount ?? 0
  }));
  const eligibleFaculty = allowRepeatDuty
    ? availableFacultyWithCounts
    : availableFacultyWithCounts.filter(f => !assignedToday.has(f.name));
  const sortedEligibleFaculty = sortFacultyList(eligibleFaculty, availableSortBy, availableSortOrder);

  const availForSuper1 = super1
    ? [
        ...sortedEligibleFaculty,
        ...availableFacultyWithCounts.filter(f => f.name === super1)
      ].filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i)
    : sortedEligibleFaculty;
  const availForSuper2 = super2
    ? [
        ...sortedEligibleFaculty,
        ...availableFacultyWithCounts.filter(f => f.name === super2)
      ].filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i)
    : sortedEligibleFaculty;

  const buildSlotFacultyOptions = (shift: 1 | 2) => {
    const rooms = shift === 1 ? rooms1 : rooms2;
    const assignedInShift = new Set<string>();
    rooms.forEach(room => room.slots.forEach(slot => {
      if (slot.facultyName) assignedInShift.add(slot.facultyName);
    }));

    return [
      ...sortedEligibleFaculty,
      ...availableFacultyWithCounts.filter(f => assignedInShift.has(f.name))
    ].filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i);
  };

  const slotOptions1 = buildSlotFacultyOptions(1);
  const slotOptions2 = buildSlotFacultyOptions(2);

  const canGenerate = 
    (shiftMode !== 'afternoon' ? super1 && rooms1.every(r => r.slots.every(s => s.facultyName)) : true) &&
    (shiftMode !== 'forenoon' ? super2 && rooms2.every(r => r.slots.every(s => s.facultyName)) : true);

  const summarizeShift = (rooms: Room[], supervisor: string) => {
    const roomCount = rooms.length;
    const students = rooms.reduce((sum, r) => sum + (parseInt(r.students || '0') || 0), 0);
    const slots = rooms.reduce((sum, r) => sum + r.slots.length, 0);
    const filledSlots = rooms.reduce((sum, r) => sum + r.slots.filter(s => s.facultyName).length, 0);
    return {
      roomCount,
      students,
      slots,
      filledSlots,
      supervisorAssigned: Boolean(supervisor)
    };
  };

  const summary1 = summarizeShift(rooms1, super1);
  const summary2 = summarizeShift(rooms2, super2);

  const allAssignments = useMemo(() => getAllDutyAssignments(), [dataVersion]);
  const allHistory = useMemo(() => getAllDutyHistory(), [dataVersion]);

  const countAssignmentSlots = (assignment: DutyAssignment) => {
    const countShift = (shift?: ShiftData) => {
      if (!shift) return { total: 0, filled: 0 };
      const total = shift.rooms.reduce((sum, r) => sum + r.slots.length, 0);
      const filled = shift.rooms.reduce((sum, r) => sum + r.slots.filter(s => s.facultyName).length, 0);
      return { total, filled };
    };

    const s1 = assignment.shiftMode !== 'afternoon' ? countShift(assignment.shift1) : { total: 0, filled: 0 };
    const s2 = assignment.shiftMode !== 'forenoon' ? countShift(assignment.shift2) : { total: 0, filled: 0 };
    return { total: s1.total + s2.total, filled: s1.filled + s2.filled };
  };

  const savedAssignments = [...allAssignments].sort((a, b) => b.date.localeCompare(a.date));
  const assignedFacultyIds = new Set(allHistory.map(h => h.facultyId));
  const facultyByLoad = [...allFaculty].sort((a, b) => (b.dutyCount || 0) - (a.dutyCount || 0));
  const topFacultyLoad = facultyByLoad.slice(0, 8);
  const maxDutyCount = topFacultyLoad[0]?.dutyCount || 1;
  const maxOverallDuty = facultyByLoad[0]?.dutyCount || 0;
  const minOverallDuty = facultyByLoad[facultyByLoad.length - 1]?.dutyCount || 0;
  const balanceIndex = maxOverallDuty === 0
    ? 100
    : Math.max(0, Math.round(100 - ((maxOverallDuty - minOverallDuty) / maxOverallDuty) * 100));

  const weekdayDutyMap = (() => {
    const map = new Map<string, number>([
      ['Mon', 0], ['Tue', 0], ['Wed', 0], ['Thu', 0], ['Fri', 0], ['Sat', 0], ['Sun', 0]
    ]);
    allHistory.forEach(item => {
      const day = new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' });
      map.set(day, (map.get(day) || 0) + 1);
    });
    return map;
  })();
  const maxWeekdayCount = Math.max(...Array.from(weekdayDutyMap.values()), 1);

  const openSavedDate = (date: string) => {
    // Always force-load the selected date, even if it's already selected.
    loadDutyAssignment(date);
    setAvailableFaculty(getAvailableFacultyByDate(date, getAllFaculty()));
    setSelectedDate(date);
    setViewMode('roster');
  };

  const resetSavedDate = (date: string) => {
    const ok = window.confirm(`Reset saved duty and duty counts for ${date}? This cannot be undone.`);
    if (!ok) return;
    resetDutyCountsForDate(date);
    deleteDutyAssignment(date);
    if (selectedDate === date) {
      loadDutyAssignment(date);
      setAvailableFaculty(getAvailableFacultyByDate(date, getAllFaculty()));
    }
    setDataVersion(v => v + 1);
  };

  const addRoom = (shift: 1 | 2) => {
    const newRoom: Room = { 
      id: Date.now(), 
      roomNo: '', 
      students: '', 
      invigilators: '1',
      slots: createSlots(1, [])
    };
    if (shift === 1) setRooms1([...rooms1, newRoom]);
    else setRooms2([...rooms2, newRoom]);
  };

  const removeRoom = (shift: 1 | 2, roomId: number) => {
    if (shift === 1) {
      const room = rooms1.find(r => r.id === roomId);
      if (room) {
        // Faculty in deleted room become available again (automatically handled by filtering)
        setRooms1(rooms1.filter(r => r.id !== roomId));
      }
    } else {
      const room = rooms2.find(r => r.id === roomId);
      if (room) {
        setRooms2(rooms2.filter(r => r.id !== roomId));
      }
    }
  };

  const updateRoom = (shift: 1 | 2, id: number, field: keyof Room, value: string) => {
    if (shift === 1) {
      setRooms1(rooms1.map(r => {
        if (r.id === id) {
          const updated = { ...r, [field]: value };
          // If invigilators count changes, update slots
          if (field === 'invigilators') {
            updated.slots = createSlots(parseInt(value || '0'), r.slots);
          }
          return updated;
        }
        return r;
      }));
    } else {
      setRooms2(rooms2.map(r => {
        if (r.id === id) {
          const updated = { ...r, [field]: value };
          if (field === 'invigilators') {
            updated.slots = createSlots(parseInt(value || '0'), r.slots);
          }
          return updated;
        }
        return r;
      }));
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, item: DragItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const removeFacultyFromRooms = (rooms: Room[], facultyName: string): Room[] => {
    return rooms.map(room => ({
      ...room,
      slots: room.slots.map(slot =>
        slot.facultyName === facultyName ? { ...slot, facultyName: null } : slot
      )
    }));
  };

  const clearFacultyFromShift = (rooms: Room[], supervisor: string, facultyName: string) => {
    return {
      rooms: removeFacultyFromRooms(rooms, facultyName),
      supervisor: supervisor === facultyName ? '' : supervisor
    };
  };

  const clearSlotById = (rooms: Room[], roomId?: number, slotId?: string): Room[] => {
    if (!roomId || !slotId) return rooms;
    return rooms.map(room => {
      if (room.id !== roomId) return room;
      return {
        ...room,
        slots: room.slots.map(slot =>
          slot.id === slotId ? { ...slot, facultyName: null } : slot
        )
      };
    });
  };

  useEffect(() => {
    const enforceWithinShift = (rooms: Room[], supervisor: string, blocked?: Set<string>) => {
      const seen = new Set<string>(blocked || []);
      let nextSupervisor = supervisor;
      if (nextSupervisor && seen.has(nextSupervisor)) {
        nextSupervisor = '';
      }
      if (nextSupervisor) seen.add(nextSupervisor);

      const nextRooms = rooms.map(room => ({
        ...room,
        slots: room.slots.map(slot => {
          if (!slot.facultyName) return slot;
          if (seen.has(slot.facultyName)) return { ...slot, facultyName: null };
          seen.add(slot.facultyName);
          return slot;
        })
      }));

      return { rooms: nextRooms, supervisor: nextSupervisor, seen };
    };

    const shift1 = enforceWithinShift(rooms1, super1);
    let nextRooms1 = shift1.rooms;
    let nextSuper1 = shift1.supervisor;
    let nextRooms2 = rooms2;
    let nextSuper2 = super2;

    if (allowRepeatDuty) {
      const shift2 = enforceWithinShift(rooms2, super2);
      nextRooms2 = shift2.rooms;
      nextSuper2 = shift2.supervisor;
    } else {
      const shift2 = enforceWithinShift(rooms2, super2, shift1.seen);
      nextRooms2 = shift2.rooms;
      nextSuper2 = shift2.supervisor;
    }

    setRooms1(nextRooms1);
    setSuper1(nextSuper1);
    setRooms2(nextRooms2);
    setSuper2(nextSuper2);
  }, [allowRepeatDuty]);

  const applyFacultyToSlot = (
    shift: 1 | 2,
    roomId: number,
    slotId: string,
    item: DragItem
  ) => {
    if (!item.facultyName) return;

    const facultyName = item.facultyName;
    let nextRooms1 = rooms1;
    let nextRooms2 = rooms2;
    let nextSuper1 = super1;
    let nextSuper2 = super2;

    // Remove from source slot if moving an already assigned faculty.
    if (item.sourceShift === 1) {
      nextRooms1 = clearSlotById(nextRooms1, item.sourceRoomId, item.sourceSlotId);
    } else if (item.sourceShift === 2) {
      nextRooms2 = clearSlotById(nextRooms2, item.sourceRoomId, item.sourceSlotId);
    }

    // Enforce single assignment per shift (also prevent supervisor+slot duplicates)
    if (shift === 1) {
      const cleared = clearFacultyFromShift(nextRooms1, nextSuper1, facultyName);
      nextRooms1 = cleared.rooms;
      nextSuper1 = cleared.supervisor;
    } else {
      const cleared = clearFacultyFromShift(nextRooms2, nextSuper2, facultyName);
      nextRooms2 = cleared.rooms;
      nextSuper2 = cleared.supervisor;
    }

    // If repeat duty is disabled, remove from the other shift too
    if (!allowRepeatDuty) {
      if (shift === 1) {
        const clearedOther = clearFacultyFromShift(nextRooms2, nextSuper2, facultyName);
        nextRooms2 = clearedOther.rooms;
        nextSuper2 = clearedOther.supervisor;
      } else {
        const clearedOther = clearFacultyFromShift(nextRooms1, nextSuper1, facultyName);
        nextRooms1 = clearedOther.rooms;
        nextSuper1 = clearedOther.supervisor;
      }
    }

    const applyToRooms = (rooms: Room[]) =>
      rooms.map(room => {
        if (room.id !== roomId) return room;
        return {
          ...room,
          slots: room.slots.map(slot =>
            slot.id === slotId ? { ...slot, facultyName } : slot
          )
        };
      });

    if (shift === 1) {
      nextRooms1 = applyToRooms(nextRooms1);
    } else {
      nextRooms2 = applyToRooms(nextRooms2);
    }

    setRooms1(nextRooms1);
    setSuper1(nextSuper1);
    setRooms2(nextRooms2);
    setSuper2(nextSuper2);
  };

  const handleDropOnSlot = (shift: 1 | 2, roomId: number, slotId: string) => {
    if (!draggedItem || !draggedItem.facultyName) return;
    applyFacultyToSlot(shift, roomId, slotId, draggedItem);
    setDraggedItem(null);
  };

  const handleSelectSlotFaculty = (shift: 1 | 2, roomId: number, slotId: string, facultyName: string) => {
    if (!facultyName) {
      removeFromSlot(shift, roomId, slotId);
      return;
    }
    applyFacultyToSlot(shift, roomId, slotId, { type: 'faculty', facultyName });
  };

  const handleSupervisorChange = (shift: 1 | 2, value: string) => {
    if (shift === 1) {
      if (!value) {
        setSuper1('');
        return;
      }
      let nextRooms1 = removeFacultyFromRooms(rooms1, value);
      let nextSuper1 = value;
      let nextRooms2 = rooms2;
      let nextSuper2 = super2;

      if (!allowRepeatDuty) {
        const clearedOther = clearFacultyFromShift(rooms2, super2, value);
        nextRooms2 = clearedOther.rooms;
        nextSuper2 = clearedOther.supervisor;
      }

      setRooms1(nextRooms1);
      setSuper1(nextSuper1);
      setRooms2(nextRooms2);
      setSuper2(nextSuper2);
      return;
    }

    if (!value) {
      setSuper2('');
      return;
    }
    let nextRooms2 = removeFacultyFromRooms(rooms2, value);
    let nextSuper2 = value;
    let nextRooms1 = rooms1;
    let nextSuper1 = super1;

    if (!allowRepeatDuty) {
      const clearedOther = clearFacultyFromShift(rooms1, super1, value);
      nextRooms1 = clearedOther.rooms;
      nextSuper1 = clearedOther.supervisor;
    }

    setRooms1(nextRooms1);
    setSuper1(nextSuper1);
    setRooms2(nextRooms2);
    setSuper2(nextSuper2);
  };

  const removeFromSlot = (shift: 1 | 2, roomId: number, slotId: string) => {
    const rooms = shift === 1 ? rooms1 : rooms2;
    const setRooms = shift === 1 ? setRooms1 : setRooms2;

    const updatedRooms = rooms.map(room => {
      if (room.id === roomId) {
        return {
          ...room,
          slots: room.slots.map(slot =>
            slot.id === slotId ? { ...slot, facultyName: null } : slot
          )
        };
      }
      return room;
    });

    setRooms(updatedRooms);
  };

  const buildAssignment = (): DutyAssignment => {
    const existing = getDutyAssignmentByDate(selectedDate);
    const now = new Date().toISOString();
    const assignment: DutyAssignment = {
      id: existing?.id || `duty-${selectedDate}`,
      date: selectedDate,
      course,
      semester,
      year,
      curriculum,
      shiftMode,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (shiftMode !== 'afternoon') {
      assignment.shift1 = {
        time: time1,
        supervisor: super1,
        rooms: rooms1
      };
    }

    if (shiftMode !== 'forenoon') {
      assignment.shift2 = {
        time: time2,
        supervisor: super2,
        rooms: rooms2
      };
    }

    return assignment;
  };

  const saveCurrentAssignment = () => {
    const assignment = buildAssignment();
    saveDutyAssignment(assignment);
    updateDutyCounts(assignment);
    setDataVersion(v => v + 1);
  };

  const handlePreviewAndPrint = () => {
    setIsPrintMode(true);
  };

  const handleSaveAndPrint = () => {
    saveCurrentAssignment();
    setIsPrintMode(true);
  };

  const allocateInvigilators = (rooms: Room[]) => {
    return rooms.map(room => ({
      ...room,
      assignedInvigilators: room.slots
        .filter(s => s.facultyName)
        .map(s => s.facultyName as string)
    }));
  };

  const facultyShortNameMap = new Map(
    allFaculty.map(f => [f.name, f.shortName || f.name])
  );
  const toShortName = (name: string) => facultyShortNameMap.get(name) || name;

  const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const buildRosterCsv = () => {
    const allAssignments = getAllDutyAssignments();
    const allDates = Array.from(new Set(allAssignments.map(a => a.date))).sort();

    const dates = exportAllDates
      ? allDates
      : allDates.filter(d => d >= exportFrom && d <= exportTo);

    const history = getAllDutyHistory();
    const assignedByDate = new Map<string, Map<string, string[]>>();
    const labelFor = (shift: number, role: string) =>
      `S${shift}-${role === 'supervisor' ? 'Supervisor' : 'Invigilator'}`;
    const orderFor = (label: string) => {
      if (label === 'S1-Supervisor') return 1;
      if (label === 'S1-Invigilator') return 2;
      if (label === 'S2-Supervisor') return 3;
      if (label === 'S2-Invigilator') return 4;
      return 9;
    };

    history.forEach(h => {
      if (!assignedByDate.has(h.date)) assignedByDate.set(h.date, new Map());
      const byFaculty = assignedByDate.get(h.date)!;
      if (!byFaculty.has(h.facultyId)) byFaculty.set(h.facultyId, []);
      const list = byFaculty.get(h.facultyId)!;
      const label = labelFor(h.shift, h.role);
      if (!list.includes(label)) list.push(label);
    });

    const faculty = allFaculty;
    const header = ['Faculty', ...dates].map(csvEscape).join(',');
    const rows = faculty.map(f => {
      const cells = dates.map(d => {
        const labels = assignedByDate.get(d)?.get(f.id) || [];
        return labels.sort((a, b) => orderFor(a) - orderFor(b)).join(' | ');
      });
      return [f.name, ...cells].map(csvEscape).join(',');
    });

    return [header, ...rows].join('\n');
  };

  const downloadRosterCsv = () => {
    const csv = buildRosterCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `duty-roster-${exportAllDates ? 'all' : `${exportFrom}_to_${exportTo}`}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleResetDate = () => {
    const ok = window.confirm(`Reset saved duty and duty counts for ${selectedDate}? This cannot be undone.`);
    if (!ok) return;
    resetDutyCountsForDate(selectedDate);
    deleteDutyAssignment(selectedDate);
    loadDutyAssignment(selectedDate);
    setAvailableFaculty(getAvailableFacultyByDate(selectedDate, getAllFaculty()));
    setDataVersion(v => v + 1);
  };

  const handleResetAll = () => {
    const ok = window.confirm('Reset ALL saved duty rosters and duty counts? This cannot be undone.');
    if (!ok) return;
    resetAllDutyCounts();
    clearAllDutyAssignments();
    loadDutyAssignment(selectedDate);
    setAvailableFaculty(getAvailableFacultyByDate(selectedDate, getAllFaculty()));
    setDataVersion(v => v + 1);
  };

  const startEditFaculty = () => {
    if (!selectedFaculty) return;
    setFacultyEdit({
      designation: selectedFaculty.designation || '',
      department: selectedFaculty.department || '',
      fid: selectedFaculty.fid || '',
      shortName: selectedFaculty.shortName || '',
      unavailable: selectedFaculty.unavailable || '',
      gender: selectedFaculty.gender || ''
    });
    setIsEditingFaculty(true);
  };

  const cancelEditFaculty = () => {
    setIsEditingFaculty(false);
  };

  const saveEditedFaculty = () => {
    if (!selectedFaculty) return;
    if (!facultyEdit.department.trim() || !facultyEdit.designation.trim()) {
      alert('Department and Designation are required.');
      return;
    }
    const updated = updateFacultyRecord(selectedFaculty.id, {
      department: facultyEdit.department.trim(),
      designation: facultyEdit.designation.trim(),
      fid: facultyEdit.fid.trim(),
      shortName: facultyEdit.shortName.trim() || undefined,
      unavailable: facultyEdit.unavailable.trim(),
      gender: facultyEdit.gender || undefined
    });
    if (!updated) {
      alert('Failed to update faculty record.');
      return;
    }
    setSelectedFaculty(updated);
    setIsEditingFaculty(false);
    setAvailableFaculty(getAvailableFacultyByDate(selectedDate, getAllFaculty()));
    setDataVersion(v => v + 1);
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
  };

  const downloadFacultyJson = () => {
    const data = getAllFaculty();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vic-faculty-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const sanitizeCurrentFormByFaculty = (facultyList: Faculty[]) => {
    const allowed = new Set(facultyList.map(f => f.name));
    if (super1 && !allowed.has(super1)) setSuper1('');
    if (super2 && !allowed.has(super2)) setSuper2('');
    setRooms1(prev => prev.map(room => ({
      ...room,
      slots: room.slots.map(slot =>
        slot.facultyName && !allowed.has(slot.facultyName)
          ? { ...slot, facultyName: null }
          : slot
      )
    })));
    setRooms2(prev => prev.map(room => ({
      ...room,
      slots: room.slots.map(slot =>
        slot.facultyName && !allowed.has(slot.facultyName)
          ? { ...slot, facultyName: null }
          : slot
      )
    })));
  };

  const handleImportFacultyJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        alert('Invalid faculty file. Expected a JSON array.');
        return;
      }

      const normalized: Faculty[] = parsed.map((item: any, idx: number) => {
        const name = String(item?.name || '').trim();
        const department = String(item?.department || '').trim();
        const designation = String(item?.designation || '').trim();
        if (!name || !department || !designation) {
          throw new Error(`Row ${idx + 1}: name, department and designation are required.`);
        }
        const id = String(item?.id || `${department.toUpperCase().slice(0, 4)}-${idx + 1}`);
        const dutyCount = Number.isFinite(Number(item?.dutyCount)) ? Number(item?.dutyCount) : 0;
        return {
          id,
          name,
          department,
          designation,
          fid: String(item?.fid || '').trim(),
          unavailable: String(item?.unavailable || '').trim(),
          shortName: String(item?.shortName || '').trim() || undefined,
          dutyCount,
          gender: item?.gender === 'Male' || item?.gender === 'Female' ? item.gender : undefined
        };
      });

      const uniqueById = new Set<string>();
      const uniqueByName = new Set<string>();
      normalized.forEach((f, idx) => {
        if (uniqueById.has(f.id)) throw new Error(`Duplicate id at row ${idx + 1}: ${f.id}`);
        if (uniqueByName.has(f.name.toLowerCase())) throw new Error(`Duplicate name at row ${idx + 1}: ${f.name}`);
        uniqueById.add(f.id);
        uniqueByName.add(f.name.toLowerCase());
      });

      const ok = window.confirm(
        `Replace faculty master with ${normalized.length} records?\n\nThis updates faculty directory and roster assignment options.`
      );
      if (!ok) return;

      replaceFacultyData(normalized);
      sanitizeCurrentFormByFaculty(normalized);
      setSelectedFaculty(null);
      setAvailableFaculty(getAvailableFacultyByDate(selectedDate, normalized));
      setDataVersion(v => v + 1);
      alert('Faculty data updated successfully.');
    } catch (error: any) {
      alert(error?.message || 'Failed to import faculty data.');
    } finally {
      e.target.value = '';
    }
  };

  const downloadWord = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: "Times New Roman", Times, serif; color: #000; }
  table { width: 88%; margin: 0 auto 10px; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #000; padding: 6px; text-align: left; }
  th:first-child, td:first-child { width: 26%; }
  td:last-child, th:last-child { word-break: break-word; white-space: normal; }
</style>
</head>
<body>${content}</body>
</html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `duty-chart-${selectedDate}.doc`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    if (!printRef.current) return;
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf')
    ]);
    const element = printRef.current;
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      windowWidth: element.scrollWidth
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let position = 0;
    while (position < imgHeight) {
      pdf.addImage(imgData, 'PNG', 0, -position, imgWidth, imgHeight);
      position += pageHeight;
      if (position < imgHeight) pdf.addPage();
    }

    pdf.save(`duty-chart-${selectedDate}.pdf`);
  };

  const downloadBackup = () => {
    const data = exportBackupData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vic-duty-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = window.confirm('Import backup and replace current data? This cannot be undone.');
    if (!ok) {
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !('faculty' in data)) {
        alert('Invalid backup file.');
        return;
      }
      importBackupData(data);
      setDataVersion(v => v + 1);
    } catch {
      alert('Failed to import backup.');
    } finally {
      e.target.value = '';
    }
  };

  // Print Mode
  if (isPrintMode) {
    const allocation1 = allocateInvigilators(rooms1);
    const allocation2 = allocateInvigilators(rooms2);
    
    return (
      <div className="min-h-screen bg-white p-3 sm:p-6 md:p-8">
        <div className="print:hidden mb-6 flex flex-wrap gap-3 items-center">
          <button 
            onClick={() => setIsPrintMode(false)} 
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
          >
            <X size={18} /> Close Preview
          </button>
          <button 
            onClick={() => window.print()} 
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30"
          >
            <Printer size={18} /> Print / Save PDF (A4)
          </button>
          <button
            onClick={downloadPdf}
            className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/30"
          >
            <Printer size={18} /> Download PDF
          </button>
          <button
            onClick={downloadWord}
            className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/30"
          >
            <Printer size={18} /> Download Word
          </button>
        </div>

        <div
          ref={printRef}
          className="max-w-[760px] mx-auto p-4 sm:p-6 bg-white"
          style={{ fontFamily: '"Times New Roman", Times, serif' }}
        >

          {shiftMode !== 'afternoon' && (
            <div className="mb-10">
              <div className="text-center mb-4 space-y-1">
                <p className="text-lg font-semibold">
                  {course} {semester} Exam {year} ({curriculum})
                </p>
                <p className="text-base font-semibold">
                  Date: {new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'long' })}
                </p>
                <p className="text-base font-semibold">Time: {time1}</p>
                <p className="text-base font-semibold">Super: {super1 ? toShortName(super1) : '—'}</p>
              </div>
              
              <table className="w-[88%] mx-auto border-collapse border border-black table-fixed text-[15px]">
                <thead>
                  <tr>
                    <th className="border border-black p-2 font-semibold text-left w-32">Room No</th>
                    <th className="border border-black p-2 font-semibold text-left">Invigilators</th>
                  </tr>
                </thead>
                <tbody>
                  {allocation1.map((room: any) => (
                    <tr key={room.id}>
                      <td className="border border-black p-2">
                        {room.roomNo}{room.students ? ` (${room.students})` : ''}
                      </td>
                      <td className="border border-black p-2 break-words whitespace-normal">
                        {room.assignedInvigilators.map(toShortName).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {shiftMode !== 'forenoon' && (
            <div className="mb-10">
              <div className="text-center mb-4 space-y-1">
                <p className="text-lg font-semibold">
                  {course} {semester} Exam {year} ({curriculum})
                </p>
                <p className="text-base font-semibold">
                  Date: {new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'long' })}
                </p>
                <p className="text-base font-semibold">Time: {time2}</p>
                <p className="text-base font-semibold">Super: {super2 ? toShortName(super2) : '—'}</p>
              </div>
              
              <table className="w-[88%] mx-auto border-collapse border border-black table-fixed text-[15px]">
                <thead>
                  <tr>
                    <th className="border border-black p-2 font-semibold text-left w-32">Room No</th>
                    <th className="border border-black p-2 font-semibold text-left">Invigilators</th>
                  </tr>
                </thead>
                <tbody>
                  {allocation2.map((room: any) => (
                    <tr key={room.id}>
                      <td className="border border-black p-2">
                        {room.roomNo}{room.students ? ` (${room.students})` : ''}
                      </td>
                      <td className="border border-black p-2 break-words whitespace-normal">
                        {room.assignedInvigilators.map(toShortName).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-16 flex justify-end">
            <div className="text-right">
              <div className="w-56 border-t border-black pt-1"></div>
              <p className="font-semibold mt-2">Principal</p>
              <p className="font-semibold">Victoria Institution (College)</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard View
  if (viewMode === 'dashboard') {
    return (
      <div className="min-h-screen theme-root" data-theme={theme}>
        <header className="theme-header border-b sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-8 w-full md:w-auto">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">VIC Duty Roster</h1>
                <nav className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setViewMode('dashboard')}
                    className="px-4 py-2 rounded-lg bg-blue-100 text-blue-700 font-medium flex items-center gap-2"
                  >
                    <LayoutDashboard size={18} />
                    Dashboard
                  </button>
                  <button
                    onClick={() => setViewMode('roster')}
                    className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                  >
                    <ClipboardList size={18} />
                    Duty Roster
                  </button>
                  <button
                    onClick={() => setViewMode('directory')}
                    className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                  >
                    <Users size={18} />
                    Faculty Directory
                  </button>
                </nav>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="solar">Solar</option>
                  <option value="cool">Cool</option>
                </select>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="theme-card rounded-xl p-5">
              <div className="text-sm text-slate-600">Saved Duty Dates</div>
              <div className="text-3xl font-bold text-slate-900 mt-1">{savedAssignments.length}</div>
            </div>
            <div className="theme-card rounded-xl p-5">
              <div className="text-sm text-slate-600">Total Duty Entries</div>
              <div className="text-3xl font-bold text-slate-900 mt-1">{allHistory.length}</div>
            </div>
            <div className="theme-card rounded-xl p-5">
              <div className="text-sm text-slate-600">Faculty Assigned</div>
              <div className="text-3xl font-bold text-slate-900 mt-1">{assignedFacultyIds.size}</div>
            </div>
            <div className="theme-card rounded-xl p-5">
              <div className="text-sm text-slate-600">Duty Balance Index</div>
              <div className="text-3xl font-bold text-slate-900 mt-1">{balanceIndex}%</div>
              <div className="text-xs text-slate-500 mt-1">Higher means better distribution</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <div className="theme-card rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-slate-900">Saved Dates</h2>
                  <span className="text-xs text-slate-500">Click a date to load in Duty Roster</span>
                </div>
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {savedAssignments.length === 0 ? (
                    <div className="theme-panel rounded-lg p-4 text-sm text-slate-600">
                      No saved duty roster yet.
                    </div>
                  ) : (
                    savedAssignments.map(item => {
                      const slot = countAssignmentSlots(item);
                      const completion = slot.total ? Math.round((slot.filled / slot.total) * 100) : 0;
                      return (
                        <div
                          key={item.id}
                          onClick={() => openSavedDate(item.date)}
                          className="w-full text-left theme-panel rounded-lg p-4 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors cursor-pointer"
                        >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                              <div className="font-semibold text-slate-900">
                                {new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' })}
                              </div>
                              <div className="text-xs text-slate-600 mt-1">
                                Shift: {item.shiftMode === 'both' ? 'Both' : item.shiftMode === 'forenoon' ? 'Forenoon' : 'Afternoon'}
                              </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
                              <div className="text-right">
                                <div className="text-xs text-slate-500">Filled Slots</div>
                                <div className="font-semibold text-slate-900">{slot.filled}/{slot.total}</div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resetSavedDate(item.date);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-red-50 text-red-700 border border-red-200 text-xs font-semibold hover:bg-red-100 transition-colors"
                                title="Reset this saved date"
                              >
                                <Trash2 size={13} />
                                Reset
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div className="h-full bg-blue-600" style={{ width: `${completion}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="theme-card rounded-xl p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Roster Tools</h2>
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800">Roster Export</div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={exportAllDates}
                      onChange={(e) => setExportAllDates(e.target.checked)}
                    />
                    All dates
                  </label>
                  {!exportAllDates && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">From</label>
                        <input
                          type="date"
                          value={exportFrom}
                          onChange={(e) => setExportFrom(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">To</label>
                        <input
                          type="date"
                          value={exportTo}
                          onChange={(e) => setExportTo(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={downloadRosterCsv}
                    className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                  >
                    Download CSV
                  </button>

                  <div className="text-sm font-semibold text-slate-800 pt-4 border-t border-slate-200">Reset</div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Target date</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <button
                    onClick={handleResetDate}
                    className="w-full px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-200 transition-colors"
                  >
                    Reset Selected Date
                  </button>
                  <button
                    onClick={handleResetAll}
                    className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                  >
                    Reset All Data
                  </button>

                  <div className="text-sm font-semibold text-slate-800 pt-4 border-t border-slate-200">Backup & Restore</div>
                  <button
                    onClick={downloadBackup}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                  >
                    Download Backup
                  </button>
                  <label className="block text-xs text-slate-600">
                    Restore from backup
                    <input
                      type="file"
                      accept="application/json"
                      onChange={handleImportBackup}
                      className="mt-2 w-full text-xs"
                    />
                  </label>

                  <div className="text-sm font-semibold text-slate-800 pt-4 border-t border-slate-200">Faculty Data</div>
                  <button
                    onClick={downloadFacultyJson}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                  >
                    Download Faculty JSON
                  </button>
                  <label className="block text-xs text-slate-600">
                    Upload faculty JSON
                    <input
                      type="file"
                      accept="application/json"
                      onChange={handleImportFacultyJson}
                      className="mt-2 w-full text-xs"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="theme-card rounded-xl p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <TrendingUp size={18} />
                  Duty Count Preview
                </h2>
                <div className="space-y-3">
                  {topFacultyLoad.length === 0 ? (
                    <div className="text-sm text-slate-600">No duty data yet.</div>
                  ) : (
                    topFacultyLoad.map(faculty => {
                      const count = faculty.dutyCount || 0;
                      const width = Math.max(6, Math.round((count / maxDutyCount) * 100));
                      return (
                        <div key={faculty.id}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-700 truncate pr-2">{faculty.name}</span>
                            <span className="text-slate-500">{count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="theme-card rounded-xl p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Weekday Load</h2>
                <div className="space-y-2">
                  {Array.from(weekdayDutyMap.entries()).map(([day, count]) => {
                    const width = Math.round((count / maxWeekdayCount) * 100);
                    return (
                      <div key={day} className="grid grid-cols-[42px_1fr_36px] items-center gap-2">
                        <span className="text-xs text-slate-600">{day}</span>
                        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full bg-violet-500" style={{ width: `${width}%` }} />
                        </div>
                        <span className="text-xs text-slate-600 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    );
  }

  // Faculty Directory View
  if (viewMode === 'directory') {
    return (
      <div className="min-h-screen theme-root" data-theme={theme}>
        <header className="theme-header border-b sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-8 w-full md:w-auto">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">VIC Duty Roster</h1>
                <nav className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setViewMode('dashboard')}
                    className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                  >
                    <LayoutDashboard size={18} />
                    Dashboard
                  </button>
                  <button
                    onClick={() => setViewMode('roster')}
                    className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                  >
                    <ClipboardList size={18} />
                    Duty Roster
                  </button>
                  <button
                    onClick={() => setViewMode('directory')}
                    className="px-4 py-2 rounded-lg bg-blue-100 text-blue-700 font-medium flex items-center gap-2"
                  >
                    <Users size={18} />
                    Faculty Directory
                  </button>
                </nav>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="solar">Solar</option>
                  <option value="cool">Cool</option>
                </select>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-8">
          <div className="theme-card rounded-xl shadow-sm p-6 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  placeholder="Search by name, department, or designation..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="pl-10 pr-10 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none cursor-pointer min-w-[200px]"
                >
                  {departments.map(dept => (
                    <option key={dept} value={dept}>
                      {dept === 'all' ? 'All Departments' : dept}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Sort by</label>
                <select
                  value={directorySortBy}
                  onChange={(e) => setDirectorySortBy(e.target.value as FacultySortBy)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="name">Name</option>
                  <option value="department">Department</option>
                  <option value="designation">Designation</option>
                  <option value="dutyCount">Duty Count</option>
                  <option value="fid">FID</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Order</label>
                <select
                  value={directorySortOrder}
                  onChange={(e) => setDirectorySortOrder(e.target.value as SortOrder)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm text-slate-600">
              <span className="font-medium">
                Showing {filteredFaculty.length} of {allFaculty.length} faculty members
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedDirectoryFaculty.map((faculty) => (
              <div
                key={faculty.id}
                onClick={() => setSelectedFaculty(faculty)}
                className="theme-card rounded-xl p-6 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                    {faculty.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                      {faculty.name}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">{faculty.designation}</p>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 size={14} className="text-slate-400" />
                        <span className="text-slate-700">{faculty.department}</span>
                      </div>
                      {faculty.fid && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock size={14} className="text-slate-400" />
                          <span className="text-slate-700">FID: {faculty.fid}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <ClipboardList size={14} className="text-blue-500" />
                        <span className="text-blue-600 font-semibold">{faculty.dutyCount} duties</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedFaculty && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              setSelectedFaculty(null);
              setIsEditingFaculty(false);
            }}
          >
            <div className="theme-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-8 rounded-t-2xl">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-2xl backdrop-blur-sm">
                      {selectedFaculty.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">{selectedFaculty.name}</h2>
                      <p className="text-blue-100 mt-1">{selectedFaculty.designation}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditingFaculty ? (
                      <>
                        <button
                          onClick={cancelEditFaculty}
                          className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveEditedFaculty}
                          className="px-3 py-1.5 rounded-lg bg-white text-blue-700 hover:bg-blue-50 text-sm font-semibold"
                        >
                          Save
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={startEditFaculty}
                        className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedFaculty(null);
                        setIsEditingFaculty(false);
                      }}
                      className="text-white/80 hover:text-white transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                      <Building2 size={16} />
                      Department
                    </div>
                    {isEditingFaculty ? (
                      <input
                        type="text"
                        value={facultyEdit.department}
                        onChange={(e) => setFacultyEdit(v => ({ ...v, department: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    ) : (
                      <p className="text-slate-900 font-semibold">{selectedFaculty.department}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                      <UserCircle2 size={16} />
                      Faculty ID
                    </div>
                    <p className="text-slate-900 font-semibold">{selectedFaculty.id}</p>
                  </div>
                </div>

                {(selectedFaculty.fid || isEditingFaculty) && (
                  <div className="theme-panel border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-600 font-medium mb-2">
                      <Clock size={18} />
                      Faculty Improvement Day (FID)
                    </div>
                    {isEditingFaculty ? (
                      <input
                        type="text"
                        value={facultyEdit.fid}
                        onChange={(e) => setFacultyEdit(v => ({ ...v, fid: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    ) : (
                      <p className="text-slate-900 font-semibold">{selectedFaculty.fid}</p>
                    )}
                  </div>
                )}

                <div className="theme-panel rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-600 font-medium mb-2">
                    <ClipboardList size={18} />
                    {isEditingFaculty ? 'Faculty Details' : 'Duty Statistics'}
                  </div>
                  {isEditingFaculty ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Designation</label>
                        <input
                          type="text"
                          value={facultyEdit.designation}
                          onChange={(e) => setFacultyEdit(v => ({ ...v, designation: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Short Name</label>
                        <input
                          type="text"
                          value={facultyEdit.shortName}
                          onChange={(e) => setFacultyEdit(v => ({ ...v, shortName: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Gender</label>
                        <select
                          value={facultyEdit.gender}
                          onChange={(e) => setFacultyEdit(v => ({ ...v, gender: e.target.value as '' | 'Male' | 'Female' }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        >
                          <option value="">Unspecified</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Unavailable</label>
                        <input
                          type="text"
                          value={facultyEdit.unavailable}
                          onChange={(e) => setFacultyEdit(v => ({ ...v, unavailable: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-900">
                      <span className="font-bold text-2xl text-blue-600">{selectedFaculty.dutyCount}</span>
                      <span className="text-slate-600 ml-2">total duties assigned</span>
                    </p>
                  )}
                </div>

                {!isEditingFaculty && (
                <div className="theme-panel border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-amber-700 font-medium mb-3">
                    <History size={18} />
                    Duty History
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {getDutyHistoryByFaculty(selectedFaculty.id).length === 0 ? (
                      <p className="text-sm text-slate-600">No duty history yet</p>
                    ) : (
                      getDutyHistoryByFaculty(selectedFaculty.id).map(history => (
                        <div key={history.id} className="text-sm theme-card rounded p-2 border border-slate-200">
                          <div className="flex justify-between">
                            <span className="font-semibold text-slate-700">
                              {new Date(history.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            <span className="text-slate-600">
                              Shift {history.shift} - {history.role === 'supervisor' ? 'Supervisor' : `Room ${history.roomNo}`}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Duty Roster View with Drag-Drop
  return (
    <div className="min-h-screen theme-root" data-theme={theme}>
      <header className="theme-header border-b sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-8 w-full md:w-auto">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">VIC Duty Roster</h1>
              <nav className="flex flex-wrap gap-1">
                <button
                  onClick={() => setViewMode('dashboard')}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                >
                  <LayoutDashboard size={18} />
                  Dashboard
                </button>
                <button
                  onClick={() => setViewMode('roster')}
                  className="px-4 py-2 rounded-lg bg-blue-100 text-blue-700 font-medium flex items-center gap-2"
                >
                  <ClipboardList size={18} />
                  Duty Roster
                </button>
                <button
                  onClick={() => setViewMode('directory')}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2"
                >
                  <Users size={18} />
                  Faculty Directory
                </button>
              </nav>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="solar">Solar</option>
                <option value="cool">Cool</option>
              </select>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium"
              >
                Logout
              </button>
            </div>
            </div>
          </div>
        </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-8">
        <div className="theme-card rounded-xl shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Exam Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Course</label>
              <input
                type="text"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Semester</label>
              <input
                type="text"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Shift Mode</label>
              <select
                value={shiftMode}
                onChange={(e) => setShiftMode(e.target.value as any)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="both">Both Shifts</option>
                <option value="forenoon">Forenoon Only</option>
                <option value="afternoon">Afternoon Only</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {shiftMode !== 'afternoon' && (
              <ShiftCard
                shiftNumber={1}
                title="Shift 1 - Forenoon"
                time={time1}
                setTime={setTime1}
                supervisor={super1}
                setSupervisor={(value) => handleSupervisorChange(1, value)}
                availableSupervisors={availForSuper1}
                rooms={rooms1}
                setRooms={setRooms1}
                addRoom={() => addRoom(1)}
                removeRoom={(id) => removeRoom(1, id)}
                updateRoom={(id, field, value) => updateRoom(1, id, field, value)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDropOnSlot={(roomId, slotId) => handleDropOnSlot(1, roomId, slotId)}
                onSelectSlotFaculty={(roomId, slotId, facultyName) => handleSelectSlotFaculty(1, roomId, slotId, facultyName)}
                removeFromSlot={(roomId, slotId) => removeFromSlot(1, roomId, slotId)}
                assignedFaculty={takenByShift1}
                compactMode={isCompactScreen}
                slotFacultyOptions={slotOptions1}
              />
            )}

            {shiftMode !== 'forenoon' && (
              <ShiftCard
                shiftNumber={2}
                title="Shift 2 - Afternoon"
                time={time2}
                setTime={setTime2}
                supervisor={super2}
                setSupervisor={(value) => handleSupervisorChange(2, value)}
                availableSupervisors={availForSuper2}
                rooms={rooms2}
                setRooms={setRooms2}
                addRoom={() => addRoom(2)}
                removeRoom={(id) => removeRoom(2, id)}
                updateRoom={(id, field, value) => updateRoom(2, id, field, value)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDropOnSlot={(roomId, slotId) => handleDropOnSlot(2, roomId, slotId)}
                onSelectSlotFaculty={(roomId, slotId, facultyName) => handleSelectSlotFaculty(2, roomId, slotId, facultyName)}
                removeFromSlot={(roomId, slotId) => removeFromSlot(2, roomId, slotId)}
                assignedFaculty={takenByShift2}
                compactMode={isCompactScreen}
                slotFacultyOptions={slotOptions2}
              />
            )}

            <div className="theme-card rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Roster Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {shiftMode !== 'afternoon' && (
                  <div className="theme-panel rounded-lg p-4">
                    <div className="text-sm font-semibold text-slate-800 mb-2">Shift 1</div>
                    <div className="text-sm text-slate-600">Rooms: <span className="font-semibold text-slate-900">{summary1.roomCount}</span></div>
                    <div className="text-sm text-slate-600">Students: <span className="font-semibold text-slate-900">{summary1.students}</span></div>
                    <div className="text-sm text-slate-600">Invigilator Slots: <span className="font-semibold text-slate-900">{summary1.filledSlots}/{summary1.slots}</span></div>
                    <div className="text-sm text-slate-600">Supervisor: <span className="font-semibold text-slate-900">{summary1.supervisorAssigned ? 'Assigned' : 'Pending'}</span></div>
                  </div>
                )}
                {shiftMode !== 'forenoon' && (
                  <div className="theme-panel rounded-lg p-4">
                    <div className="text-sm font-semibold text-slate-800 mb-2">Shift 2</div>
                    <div className="text-sm text-slate-600">Rooms: <span className="font-semibold text-slate-900">{summary2.roomCount}</span></div>
                    <div className="text-sm text-slate-600">Students: <span className="font-semibold text-slate-900">{summary2.students}</span></div>
                    <div className="text-sm text-slate-600">Invigilator Slots: <span className="font-semibold text-slate-900">{summary2.filledSlots}/{summary2.slots}</span></div>
                    <div className="text-sm text-slate-600">Supervisor: <span className="font-semibold text-slate-900">{summary2.supervisorAssigned ? 'Assigned' : 'Pending'}</span></div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="theme-card rounded-xl shadow-sm p-6 lg:sticky lg:top-24">
              <h2 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Users size={20} />
                Available Faculty ({sortedEligibleFaculty.length})
              </h2>
              
              <div className="text-sm text-slate-600 mb-4">
                Faculty available on {new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>

              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-medium text-slate-600">Allow repeat duty</label>
                <button
                  onClick={() => setAllowRepeatDuty(v => !v)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    allowRepeatDuty
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {allowRepeatDuty ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Sort by</label>
                  <select
                    value={availableSortBy}
                    onChange={(e) => setAvailableSortBy(e.target.value as FacultySortBy)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="name">Name</option>
                    <option value="department">Department</option>
                    <option value="designation">Designation</option>
                    <option value="dutyCount">Duty Count</option>
                    <option value="fid">FID</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Order</label>
                  <select
                    value={availableSortOrder}
                    onChange={(e) => setAvailableSortOrder(e.target.value as SortOrder)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {isCompactScreen && (
                  <div className="text-xs rounded-lg px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200">
                    Assign invigilators directly from each room slot dropdown.
                  </div>
                )}
                {sortedEligibleFaculty.length === 0 ? (
                  <p className="text-center py-8 text-slate-500">No faculty available for this date</p>
                ) : (
                  <>
                    {sortedEligibleFaculty.map(faculty => (
                      <div
                        key={`avail-${faculty.id}`}
                        draggable={!isCompactScreen}
                        onDragStart={(e) => handleDragStart(e, { type: 'faculty', facultyName: faculty.name })}
                        className={`px-4 py-3 bg-slate-50 hover:bg-blue-50 rounded-lg transition-colors group border border-transparent hover:border-blue-200 ${isCompactScreen ? '' : 'cursor-move'}`}
                      >
                        <div className="flex items-center gap-2">
                          <GripVertical size={16} className="text-slate-400 group-hover:text-blue-500" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-slate-900 text-sm group-hover:text-blue-600">
                                {faculty.name}
                              </div>
                              <div className="text-[11px] font-semibold text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded-full">
                                Duties {faculty.dutyCount || 0}
                              </div>
                            </div>
                            <div className="text-xs text-slate-600 mt-1">{faculty.department}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-slate-200">
                <button
                  onClick={handlePreviewAndPrint}
                  disabled={!canGenerate}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white text-blue-700 border border-blue-300 rounded-lg font-medium hover:bg-blue-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed transition-colors"
                >
                  <Printer size={18} />
                  Preview & Print
                </button>
                <button
                  onClick={handleSaveAndPrint}
                  disabled={!canGenerate}
                  className="w-full mt-3 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-600/30"
                >
                  <Printer size={18} />
                  Save & Print
                </button>
                
                {!canGenerate && (
                  <div className="mt-3 flex items-start gap-2 text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>Fill all room slots and select supervisors to generate the duty chart</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Shift Card Component
function ShiftCard({
  shiftNumber,
  title,
  time,
  setTime,
  supervisor,
  setSupervisor,
  availableSupervisors,
  rooms,
  setRooms,
  addRoom,
  removeRoom,
  updateRoom,
  onDragStart,
  onDragOver,
  onDropOnSlot,
  onSelectSlotFaculty,
  removeFromSlot,
  assignedFaculty,
  compactMode,
  slotFacultyOptions
}: {
  shiftNumber: number;
  title: string;
  time: string;
  setTime: (v: string) => void;
  supervisor: string;
  setSupervisor: (v: string) => void;
  availableSupervisors: Faculty[];
  rooms: Room[];
  setRooms: (rooms: Room[]) => void;
  addRoom: () => void;
  removeRoom: (id: number) => void;
  updateRoom: (id: number, field: keyof Room, value: string) => void;
  onDragStart: (e: React.DragEvent, item: DragItem) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDropOnSlot: (roomId: number, slotId: string) => void;
  onSelectSlotFaculty: (roomId: number, slotId: string, facultyName: string) => void;
  removeFromSlot: (roomId: number, slotId: string) => void;
  assignedFaculty: Set<string>;
  compactMode: boolean;
  slotFacultyOptions: Faculty[];
}) {
  const totalSlots = rooms.reduce((sum, r) => sum + r.slots.length, 0);
  const filledSlots = rooms.reduce((sum, r) => sum + r.slots.filter(s => s.facultyName).length, 0);

  return (
    <div className="theme-card rounded-xl shadow-sm p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600 mt-1">{shiftNumber === 1 ? 'Morning examination shift' : 'Afternoon examination shift'}</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
          <UserCheck size={16} />
          {filledSlots}/{totalSlots} Slots
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Time Slot</label>
          <input
            type="text"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Supervisor</label>
          <select
            value={supervisor}
            onChange={(e) => setSupervisor(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">Select Supervisor</option>
            {availableSupervisors.map(f => (
              <option key={f.id} value={f.name}>{f.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Examination Rooms</h3>
          <button
            onClick={addRoom}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Add Room
          </button>
        </div>

        {rooms.map((room) => (
          <div key={room.id} className="border-2 border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors bg-slate-50/50">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                    <DoorOpen size={14} className="text-blue-500" />
                    Room No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 02"
                    value={room.roomNo}
                    onChange={(e) => updateRoom(room.id, 'roomNo', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                    <Users size={14} className="text-green-500" />
                    Students
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 24"
                    value={room.students}
                    onChange={(e) => updateRoom(room.id, 'students', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                    <UserCheck size={14} className="text-purple-500" />
                    Invigilators
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 2"
                    value={room.invigilators}
                    onChange={(e) => updateRoom(room.id, 'invigilators', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
              </div>
              <button
                onClick={() => removeRoom(room.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors self-end sm:self-auto sm:mt-5"
              >
                <Trash2 size={18} />
              </button>
            </div>

            {/* Invigilator Slots */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Invigilator Slots</div>
              {room.slots.map((slot, idx) => (
                <div
                  key={slot.id}
                  onDragOver={onDragOver}
                  onDrop={() => onDropOnSlot(room.id, slot.id)}
                  className={`relative border-2 border-dashed rounded-lg p-3 transition-all ${
                    slot.facultyName 
                      ? 'slot-assigned' 
                      : 'slot-empty'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="slot-number w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </div>
                      {compactMode ? (
                        <select
                          value={slot.facultyName || ''}
                          onChange={(e) => onSelectSlotFaculty(room.id, slot.id, e.target.value)}
                          className="min-w-[220px] w-full max-w-xs px-2 py-1.5 border border-slate-300 rounded-md text-sm bg-white"
                        >
                          <option value="">Select Invigilator</option>
                          {slotFacultyOptions.map(f => (
                            <option key={`slot-option-${room.id}-${slot.id}-${f.id}`} value={f.name}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      ) : slot.facultyName ? (
                        <div
                          draggable
                          onDragStart={(e) => onDragStart(e, {
                            type: 'faculty',
                            facultyName: slot.facultyName!,
                            sourceShift: shiftNumber,
                            sourceRoomId: room.id,
                            sourceSlotId: slot.id
                          })}
                          className="flex items-center gap-2 cursor-move"
                        >
                          <GripVertical size={14} className="text-blue-400" />
                          <span className="slot-name font-medium text-sm">{slot.facultyName}</span>
                        </div>
                      ) : (
                        <span className="slot-placeholder text-sm italic">Drag faculty here...</span>
                      )}
                    </div>
                    {slot.facultyName && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromSlot(room.id, slot.id);
                        }}
                        className="text-red-500 hover:text-red-700 hover:bg-red-100 p-1 rounded transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
